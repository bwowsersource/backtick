const fs = require('fs');
const awaitSeries = async (promises = [], map = item => item) => {
    const out = [];
    try {
        for (let i = 0; i < promises.length; ++i) {
            out.push(await map(promises[i], i));
        }
        return out;
    } catch (e) {
        out.error = e;
        return out;
    }
}

const dumpData = (sourceName, filename, data) => {
    fs.writeFileSync('.generated/' + sourceName + '-' + filename + '.json', JSON.stringify(data, null, 4));
}
module.exports = {
    awaitSeries,
    dumpData
}

