var http = require('http');
var fs = require('fs');
const backtick = require('./index');
const { name, version } = require('../package.json');
const { awaitSeries } = require('./utils');

const PORT = 8083;
const RESOURCE_ROOT = '/resources'

const exampleGlobal = {
    about: "Hello, this is " + name + '@' + version,
    ops: {
        while: (conditionalStateFn) => {

            function renderer(iterResults = []) {
                return (segments) => {
                    if (!iterResults.length || !iterResults[0].length) return "";
                    const groupSize = iterResults[0].length;
                    const takeSegments = segments.splice(0, groupSize);
                    const blockTexts = iterResults.map(iter => takeSegments.reduce((s1, s2, i) => s1 + iter[i - 1] + s2));
                    return blockTexts.join('');
                }
            }
            function handler(statementFns, readonlyEvalArgs) {
                return async function getRenderer({ ns, ...globals }) { // use our own evalargs
                    const results = [];
                    let state;
                    while (1) {
                        state = conditionalStateFn(state);
                        if (!state) break;
                        iterations++;
                        results.push(awaitSeries(statementFns, async (fn) => {
                            const arg = fn({ ...globals, ns })
                            return await readonlyEvalArgs(arg);
                        }))
                    }
                    return renderer(results);
                }
            }

            return backtick.createCaptureGroup(handler);
        },
        end: backtick.captureGroupEnd
    }
}
const examplePayload = {
    "name": {
        "morning": "Akash",
        "evening": "Webcrafti"
    }
}


async function jsmlRouter(req) {
    const path = req.url;
    const filePath = '.' + RESOURCE_ROOT + path + (/\.jsml$/.test(path) ? '' : '.jsml')
    try {
        const template = fs.readFileSync(filePath, { encoding: 'utf-8' });
        const groomed = backtick.groom(template);
        return backtick(groomed, { ...exampleGlobal, args: examplePayload });
    } catch (e) {
        console.error(e);
        return { text: "Not found!!", ns: null }
    }
}

http.createServer(function (req, res) {
    jsmlRouter(req).then(({ text, ns }) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'X-NS': JSON.stringify(ns) });

        res.end(text);
    });

}).listen(PORT);

console.log("serving at http://localhost:" + PORT)