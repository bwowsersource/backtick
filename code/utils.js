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

module.exports = {
    awaitSeries
}