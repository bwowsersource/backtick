const { ConstReInit, processedError } = require('./errors');
const { awaitSeries, dumpData, functionize, findFirstDuplicateKey } = require('./utils');
const { createCaptureControls } = require('./captureGroups');
const { CAPTURE_END, CAPTURE_START, CAPTURED, COMMENT_CLOSE, } = require('./consts');
const { renderTokens } = require('./renderer');


const SOURCEFILE_STUB = "template.jsml";

let currentFile = "someFileName";
const keepArtifacts = (type, data) => {
    dumpData(currentFile, type, data)
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
            function findStatement(remaining, pos = 0) {
                const nextPos = remaining.indexOf(segAfter, pos + 1);
                if (nextPos == -1) throw { msg: "Failed to delimit: ", segAfter, pos, remaining: remaining.length + remaining.substring(129, segAfter.length) };
                const statementText = remaining.substring(0, nextPos);
                try {
                    // try creating a function that execute this statement as a template literal
                    Function("`${" + statementText + "}`");
                    return statementText;
                } catch (e) {
                    return findStatement(remaining, nextPos);
                }
            }

            const statement = findStatement(remaining, 0);
            remaining = remaining.substring(statement.length);
            if (remaining[0] !== '}') throw `Unexpected token ${remaining[0]} at ${source.length - remaining.length}`;
            remaining = remaining.substring(1); // strip the '}';
            statements.push(statement);

            return { remaining, statements };
        }, { remaining: source, statements: [] });

        return { segments: segs, statements, statementPreVals: args };
    }


    return (...args) => () => {
        const out = spyTagFn(...args);
        keepArtifacts('tokens', out);
        return out;
    };
}


const backtick = async (template, globals = {}) => {
    if (typeof globals !== "object") throw new Error("`globals` argument must be of type `object|undefined`");
    const tagFn = backTickTagFn();
    const captureControls = createCaptureControls();
    const context = {
        ...globals,
        bt: tagFn,
        capture: captureControls,
        ns: {},
    }


    // try {
    const tokenizerTagfn = tokenizer(template);
    const withBackticks = functionize(
        'return bt`' + template + '`; //# sourceURL=' + SOURCEFILE_STUB,
        Object.keys(context)
    );
    console.log("tokenizing")
    const tokenizeTemplate = withBackticks({ ...context, bt: tokenizerTagfn });
    const tokens = tokenizeTemplate();

    const out = await renderTokens({ ...tokens, context });
    return {
        ...out,
        render: ns => renderTokens({
            ...tokens, globals: { ...context, ns }
        })
    }
    // return tagFn(tokens.segments, ...(tokens.statements).map(s => "${" + s + "}"))
    // return withBackticks(context)
    // } catch (e) {
    //     throw processedError(e, template, SOURCEFILE_STUB);
    // }
}

function applyCaptureMarker(handler, newMarkers) {
    const markers = { ...handler.captureMarker, ...newMarkers }
    handler.captureMarker = markers;
    return handler;
}
const createCaptureGroup = (handler = () => COMMENT_CLOSE) => {
    return applyCaptureMarker(handler, { open: CAPTURE_START });
};
backtick.groom = (str) => escapeBackticks(str);
backtick.createCaptureGroup = createCaptureGroup;
backtick.captureGroupEnd = { captureMarker: { close: CAPTURE_END } };

module.exports = backtick;