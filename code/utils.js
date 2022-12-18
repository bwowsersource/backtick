const fs = require('fs');
const awaitSeries = async (promises = [], map = item => item) => {
    const out = [];
    try {
        for (let i = 0; i < promises.length; ++i) {
            out.push(await map(promises[i], i));
        }
        return out;
    } catch (e) {
        throw e;
        // out.error = e;
        // return out;
    }
}

const dumpData = (sourceName, filename, data) => {
    const targetDir = '.generated/';
    fs.mkdir(targetDir, { recursive: true }, (err) => {
        if (err) throw err;
        fs.writeFileSync(targetDir + sourceName + '-' + filename + '.json', JSON.stringify(data, null, 4));

    });
}

const functionize = (text, namedArgs) => {
    const argsText = `{ ${namedArgs.join(', ')}}={}`; // arg1
    return Function(argsText, text);
}

function findFirstDuplicateKey(source, compareObj) {
    return Object.keys(compareObj).find(newConstKey => source.hasOwnProperty(newConstKey));
}

module.exports = {
    awaitSeries,
    dumpData,
    functionize,
    findFirstDuplicateKey,
}

