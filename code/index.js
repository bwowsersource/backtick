
const backTickTagFn = (segments, ...args) => {
    // console.log(segments);
    return segments.reduce((seg1, seg2, index) => {
        const arg = args.shift();
        const val = (typeof arg === 'function') ? arg() : arg;
        return seg1 + val + seg2;
    })
}

module.exports = (template,args) => {
    
    const context = {
        bt_: backTickTagFn,
        $args: args
    }


    const withBackticks = Function('{$args,bt_}={}', 'return bt_`' + template + '`');
    return withBackticks(context)
    // withBackticks.bind(context);
}
