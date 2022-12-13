const { ConstReInit, processedError } = require('./errors');

const SOURCEFILE_STUB = "template.jsml";

function findFirstDuplicateKey(source, compareObj) {
    return Object.keys(compareObj).find(newConstKey => source.hasOwnProperty(newConstKey));
}
const backTickTagFn = (segments, ...args) => {

    const moduleScopeVars = {};
    const moduleScopeConsts = {};
    try {

        const text = segments.reduce((seg1, seg2, index) => {
            const arg = args[index - 1];

            const scopeInjection = { ...moduleScopeVars, ...moduleScopeConsts };
            const val = (typeof arg === 'function') ? arg(scopeInjection, index) : arg;
            if (!val)
                return seg1 + seg2;
            if (typeof val === "string")
                return seg1 + val + seg2;
            if (
                typeof val === "object" &&
                ({}.toString() === val.toString()) // true => val doesn't have a custom toString
            ) {
                // set scopeVars
                const { const: constCandidates = {}, ...mutableVarCandidates } = val;

                const constExists = findFirstDuplicateKey(moduleScopeConsts, { ...mutableVarCandidates, ...constCandidates });
                if (constExists) throw new ConstReInit(constExists);

                Object.assign(moduleScopeConsts, constCandidates);
                Object.assign(moduleScopeVars, mutableVarCandidates);
                return seg1 + seg2; // don't append val
            }

            // if not returned by now, return string
            return seg1 + String(val) + seg2;

        });
        return { text, ns: { ...moduleScopeVars, ...moduleScopeConsts }, toString: () => text }
    } catch (e) {
        throw processedError(e);
    }
}


function escapeBackticks(str) {
    const char = '`';
    const escapedChar = '${"`"}';
    const segments = str.split(char);
    const [out] = segments.reduce(([output, workingSeg], seg, i) => {
        const nextSeg = workingSeg + seg;
        try {
            Function('`' + nextSeg + '`');
            output.push(nextSeg);
            return [output, '']
        } catch (e) {
            return [output, workingSeg + seg + char];
        }
    }, [[], '']);

    return out.join(escapedChar);
}


const backtick = (template, globals = {}) => {
    if (typeof globals !== "object") throw new Error("`globals` argument must be of type `object|undefined`");
    const tagFn = backTickTagFn();
    const context = {
        ...globals,
        bt: tagFn,
    }

    const globalNames = Object.keys(context);

    try {
        const withBackticks = Function(
            `{ ${globalNames.join(', ')}}={}`, // arg1
            'return bt`' + template + '`; //# sourceURL=' + SOURCEFILE_STUB);
        return withBackticks(context)
    } catch (e) {
        throw processedError(e, template, SOURCEFILE_STUB);
    }
}

backtick.groom = (str) => escapeBackticks(str);

module.exports = backtick;