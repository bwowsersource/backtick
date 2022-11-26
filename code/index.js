
const backTickTagFn = (segments, ...args) => {
    // console.log(segments);
    return segments.reduce((seg1, seg2, index) => {
        const arg = args.shift();
        const val = (typeof arg === 'function') ? arg() : arg;
        return seg1 + val + seg2;
    })
}

module.exports = (template,args, globals={}) => {
    if(typeof globals !== "object") throw new Error("`globals` argument must be of type `object|undefined`")
    const context = {
        bt__: backTickTagFn,
        bt_: backTickTagFn,
        bt: backTickTagFn,
        $args: args,
        args,
        ...globals
    }

    const globalNames = Object.keys(globals);
    const withBackticks = Function(
        `{ $args, bt_, ${globalNames.join(', ')}}={}`, // arg1
        'return bt_`' + template + '`');
    return withBackticks(context)
    // withBackticks.bind(context);
}
