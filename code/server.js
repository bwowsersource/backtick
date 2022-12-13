var http = require('http');
var fs = require('fs');
const backtick = require('./index');
const { name, version } = require('../package.json');

const PORT = 8083;
const RESOURCE_ROOT = '/resources'

const exampleGlobal = {
    about: "Hello, this is " + name + '@' + version
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