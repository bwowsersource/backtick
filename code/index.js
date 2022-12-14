const { ConstReInit, processedError } = require('./errors');
const { awaitSeries, dumpData } = require('./utils');

const SOURCEFILE_STUB = "template.jsml";

function findFirstDuplicateKey(source, compareObj) {
    return Object.keys(compareObj).find(newConstKey => source.hasOwnProperty(newConstKey));
}


function newCaptureGroup() {
    const openGroups = []
    const captureMarkedArgs = (val, statementFn, pos) => {

        if (val.captureMarker) {
            console.log("going through a captureMarker", val.captureMarker)
            if (openGroups.length && (typeof val.captureMarker.close === "symbol")) {
                const lastGroup = openGroups.pop();
                lastGroup.end = pos;
                if (!openGroups.length) { // root of nest
                    // console.log("groupEnd", lastGroup)
                    return lastGroup;
                } else {
                    const parent = openGroups[openGroups.length - 1];
                    parent.statementFns.push(lastGroup) // make it a renderer fn
                }
            }
            if (typeof val.captureMarker.open === "symbol") {
                openGroups.push({ start: pos, statementFns: [] })
            }
            return true;
        } else if (openGroups.length) {
            const group = openGroups[openGroups.length - 1];
            group.statementFns.push(statementFn);
            return true;
        }
        return false;
    }
    return captureMarkedArgs;
}

function newNSContext(seedNS = {}) {
    const { const: consts = {}, ...vars } = seedNS;
    const getNs = () => ({ ...vars, ...consts });

    const evalArg = async (arg) => {
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
    }
    return { evalArg, getNs };
}


const CAPTURED = Symbol('CAPTURED_ARG')
async function executeStatements(statementFns, seedNS = {}, globals) {
    let capture = newCaptureGroup();
    const { evalArg, getNs } = newNSContext(seedNS);

    const values = await awaitSeries(statementFns, async (statementFn, i) => {
        const arg = statementFn({ ...globals, ns: getNs() }, i);
        const group = capture(arg, statementFn, i);
        if (group) { // true or object
            console.log("group", group)
            if (typeof group === "object") { // group closing reached
                console.log("typeof arg", typeof arg);
                capture = newCaptureGroup();
                if (typeof arg === "function") return arg({ ...globals, ns: getNs() }, group)
                return null;
            }
            return CAPTURED;
        }
        return await evalArg(arg);
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


function interpolate(segments, vals) {
    // prepare
    const { mainTexts, groupTexts, mainVals } = segments.reduce((obj, seg, i) => {
        const val = vals[i];
        if (typeof val === "symbol" && !obj.currentGroup) {
            obj.mainTexts.push(seg);
            obj.currentGroup = [];
        } else if (typeof val === "symbol" && Array.isArray(obj.currentGroup)) {
            obj.currentGroup.push(seg);
        }
        else if (Array.isArray(val)) {
            obj.currentGroup.push(seg);
            obj.groupTexts.push([obj.currentGroup, val]);
            obj.currentGroup = null;

            obj.mainVals.push("{Evaluate group and insert val here}");
        } else {
            obj.mainTexts.push(seg);
            obj.mainVals.push(val);
        }
        return obj;
    },
        { mainTexts: [], mainVals: [], groupTexts: [], currentGroup: null })
    function getGlue(out, i) {
        const val = out[i - 1];
        if (!val) return '';
        if (typeof val == "symbol") return "$CAPTURED";
        return val;
    }
    console.log("groupTexts", groupTexts)
    return mainTexts.reduce((seg1, seg2, i) => seg1 + getGlue(mainVals, i) + seg2);
    // return segments.reduce((seg1, seg2, i) => seg1 + getGlue(vals, i) + seg2);
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
        dumpData('somefile', 'tokens', tokens)
        const statementFns = tokens.statements.map(s => Function(globalArgs, 'return ' + s));
        const out = await executeStatements(statementFns, {}, context);

        const text = interpolate(tokens.segments, out.values);

        return { text, ns: out.ns };
        // return tagFn(tokens.segments, ...(tokens.statements).map(s => "${" + s + "}"))
        // return withBackticks(context)
    } catch (e) {
        throw processedError(e, template, SOURCEFILE_STUB);
    }
}

backtick.groom = (str) => escapeBackticks(str);

module.exports = backtick;