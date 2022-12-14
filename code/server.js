var http = require('http');
var fs = require('fs');
const backtick = require('./index');
const { name, version } = require('../package.json');

const PORT = 8083;
const RESOURCE_ROOT = '/resources'

const exampleGlobal = {
    about: "Hello, this is " + name + '@' + version,
    ops: {
        while: (name, conditionalStateFn) => {
            // push name and condition to bt captureGp stack
            if(typeof name === "function"){
                conditionalStateFn=name;
                name=null;
            }
            function handler(ctx, { statementFns }) {
                return statementFns;
            }
            handler.captureMarker = { open: Symbol() };
            return handler;
        },
        end: (() => {
            // pull name and condition from bt captureGp stack
            function handler(ctx, { statementFns }) {
                return statementFns;
            }
            handler.captureMarker = { close: Symbol() };
            return handler;
        })()
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