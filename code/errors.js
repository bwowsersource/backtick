
class ConstReInit extends Error {
    constructor(key) {
        super(`a const with name ${key} already exist in this context`)
    }
}


class UnprocessableValue extends Error {
    constructor(val, index) {
        super(`Unprocessable value ${String(val)} at ${index}`)
    }
}

class GenericTemplateError extends Error {
    constructor(e) {
        super(`There are errors in template: ${e.message}`);
        this.err = e;
    }
}

class TemplateErrorWithTrace extends Error {
    constructor([srcLinesArr, line, col, e]) {

        const srcLines = ['...', ...srcLinesArr, '...'].join('\n');
        let stack = e.message;
        stack += ` at line:${line + 1}${col ? ' col:' + (col + 1) : ''}`;
        stack += '\n' + srcLines + '\n';
        super(e.message);
        this.stack = stack;
        this.message = e.message
        this.err = { line, col, e };
    }
}


function parseStack(e, sourceTemplate) {
    const [_msg, firstLine] = e.stack.split('\n');
    if (firstLine) {
        const [all, line, colWithColon, colNum] = firstLine.match(new RegExp(/:([0-9]+)(:([0-9]+))?[^0-9]*$/)) || [];
        const lineIndex = ((line - 1) - 2); //stack-line numer index starts from 1. line0 is "function()", line1 is opening "{"
        if (!lineIndex) return new GenericTemplateError(e);
        const srcLineArr = sourceTemplate.split('\n')
            .map((line, index) => (index === lineIndex ? '>>>' : '') + '\t' + line)
            .filter((line, index) => Math.abs(lineIndex - index) < 3);

        const colIndex = (colNum || 1) - 1; // stack colNum index starts from 1
        return new TemplateErrorWithTrace([srcLineArr, lineIndex, colIndex, e])
    }
}
function processedError(e, sourceTemplate) {
    const knownErrors = [ConstReInit, UnprocessableValue]
    if (knownErrors.some(knownErr => e instanceof knownErr)) return e;
    if (sourceTemplate) return parseStack(e, sourceTemplate);
    return new GenericTemplateError(e);
}

module.exports = { ConstReInit, UnprocessableValue, GenericTemplateError, processedError };