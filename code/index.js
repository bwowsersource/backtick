const { ConstReInit, processedError } = require('./errors');
const { awaitSeries } = require('./utils');

const SOURCEFILE_STUB = "template.jsml";

function findFirstDuplicateKey(source, compareObj) {
    return Object.keys(compareObj).find(newConstKey => source.hasOwnProperty(newConstKey));
}

async function createNS(statementFns, seedNS = {}, globals) {
    const { const: consts = {}, ...vars } = seedNS;
    const getNs = () => ({ ...vars, ...consts });
    const values = await awaitSeries(statementFns, async (statementFn, i) => {
        const arg = (typeof statementFn === 'function') ? statementFn({ ...globals, ns: getNs() }, i) : statementFn; // this is globalNs. It should be a proxy to current ns
        const val = (typeof arg === 'function') ? arg(getNs()) : arg;
        const result = await val;
        if (
            typeof result === "object" &&
            ({}.toString() === result.toString()) // true => result doesn't have a custom `toString`
        ) {
            // set scopeVars
            const { const: constCandidates = {}, ...varCandidates } = result;

            const constExists = findFirstDuplicateKey(consts, { ...varCandidates, ...constCandidates });
            if (constExists) throw new ConstReInit(constExists);

            Object.assign(consts, constCandidates);
            Object.assign(vars, varCandidates);
        } else if (result) return String(result);
        return null;
    });

    return { ns: getNs(), values };
}

const backTickTagFn = () => (segments, ...args) => {

    // const fnArgs = args.filter(arg => (typeof arg === 'function'));

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

function tokenizer(source = '') {
    source = source.replaceAll(/\r\n/gi, '\n');
    const spyTagFn = (segs, ...args) => {
        const { statements } = args.reduce((state, arg, i) => {
            let segBefore = segs[i] + "${";
            let segAfter = "}" + segs[i + 1];
            let { remaining, statements } = state;

            const match = remaining.substring(0, segBefore.length);
            if (segBefore !== match) throw { statements, remaining: remaining.substring(0, 15) + '...', segBefore, match, segAfter, i };
            remaining = remaining.substring(segBefore.length);

            // find templateArg ending
            function findStatement(pos = 0) {
                const nextPos = remaining.indexOf(segAfter, pos);
                if (nextPos == -1) throw { msg: "Failed to delimit: ", segAfter, pos, remaining: remaining.length + remaining.substring(129, segAfter.length) };
                const statementText = remaining.substring(0, nextPos);
                try {
                    // try creating a function that execute this statement as a template literal
                    Function("`${" + statementText + "}`");
                    return statementText;
                } catch (e) {
                    return findStatement(nextPos);
                }
            }

            const statement = findStatement();
            remaining = remaining.substring(statement.length);
            if (remaining[0] !== '}') throw `Unexpected token ${remaining[0]} at ${source.length - remaining.length}`;
            remaining = remaining.substring(1); // strip the '}';
            statements.push(statement);

            return { remaining, statements };
        }, { remaining: source, statements: [] });

        return { segments: segs, statements };
    }


    return (...args) => () => spyTagFn(...args);
}


const backtick = async (template, globals = {}) => {
    if (typeof globals !== "object") throw new Error("`globals` argument must be of type `object|undefined`");
    const tagFn = backTickTagFn();
    const context = {
        ...globals,
        bt: tagFn,
        ns: {},
    }

    const globalNames = Object.keys(context);
    const globalArgs = `{ ${globalNames.join(', ')}}={}`; // arg1
    try {
        const tokenizerTagfn = tokenizer(template);
        const withBackticks = Function(
            globalArgs,
            'return bt`' + template + '`; //# sourceURL=' + SOURCEFILE_STUB);
        const parseTemplate = withBackticks({ ...context, bt: tokenizerTagfn });
        const tokens = parseTemplate();
        const execChain = tokens.statements.map(s => Function(globalArgs, 'return ' + s));
        const out = await createNS(execChain, {}, context);
        const text = tokens.segments.reduce((seg1, seg2, i) => seg1 + (out.values[i - 1] || '') + seg2);
        console.log("out", out);
        return { text, ns: out.ns };
        // return tagFn(tokens.segments, ...(tokens.statements).map(s => "${" + s + "}"))
        // return withBackticks(context)
    } catch (e) {
        throw processedError(e, template, SOURCEFILE_STUB);
    }
}

backtick.groom = (str) => escapeBackticks(str);

module.exports = backtick;