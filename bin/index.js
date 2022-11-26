#!/usr/bin/env node

const fs = require('fs');
const { stdout } = require('process');
const backtick = require('../code/index');

const filename = process.argv[2];
const argsjson = process.argv[3];
if (!filename) throw new Error("No input file provided!");

const template = fs.readFileSync(filename, { encoding: 'utf8', flag: 'r' });
let args = {}
if (argsjson) {
    args = JSON.parse(fs.readFileSync(argsjson, { encoding: 'utf8', flag: 'r' }));
    // console.log(args);
}


stdout.write(backtick(template,args));