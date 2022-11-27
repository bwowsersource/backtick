const { ConstReInit, processedError } = require('./errors');

function findFirstDuplicateKey(source, compareObj) {
    return Object.keys(compareObj).find(newConstKey => source.hasOwnProperty(newConstKey));
}
const backTickTagFn = (segments, ...args) => {

    const moduleScopeVars = {};
    const moduleScopeConsts = {};
    try {

        return segments.reduce((seg1, seg2, index) => {
            const arg = args.shift();

            const scopeInjection = { ...moduleScopeVars, ...moduleScopeConsts };
            const val = (typeof arg === 'function') ? arg(scopeInjection, index) : arg;
            if (typeof val === "string")
                return seg1 + val + seg2;
            if (typeof val === "object") {
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

    } catch (e) {
        throw processedError(e);
    }
}

const backtick = (template, args, globals = {}) => {
    if (typeof globals !== "object") throw new Error("`globals` argument must be of type `object|undefined`")
    const context = {
        bt__: backTickTagFn,
        bt_: backTickTagFn,
        bt: backTickTagFn,
        $args: args,
        args,
        ...globals
    }

    const globalNames = Object.keys(context);

    try {
        const withBackticks = Function(
            `{ ${globalNames.join(', ')}}={}`, // arg1
            'return bt_`' + template + '`');
        return withBackticks(context)
    } catch (e) {
        throw processedError(e);
    }
    // withBackticks.bind(context);
}


module.exports = backtick;