var http = require('http');
var fs = require('fs');
const backtick = require('./index');
const {name,version}=require('../package.json');

const PORT = 8083;
const RESOURCE_ROOT = '/resources'

const exampleGlobal = {
    about:"Hello, this is "+ name+'@'+version
}
const examplePayload = {
    "name": {
        "morning": "Akash",
        "evening": "Webcrafti"
    }
}


function jsmlRouter(req) {
    const path = req.url;
    const filePath = '.' + RESOURCE_ROOT + path + (/\.jsml$/.test(path) ? '' : '.jsml')
    try{
        const template = fs.readFileSync(filePath, {encoding: 'utf-8'});
        const groomed=backtick.groom(template);
        return backtick(groomed, examplePayload, exampleGlobal);
    }catch(e){
        console.error(e);
        return "Not found!!"
    }
}

http.createServer(function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(jsmlRouter(req));
}).listen(PORT);

console.log("serving at http://localhost:" + PORT)