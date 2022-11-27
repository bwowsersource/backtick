
class ConstReInit extends Error{
    constructor(key){
        super(`a const with name ${key} already exist in this context`)
    }
}


class UnprocessableValue extends Error{
    constructor(val, index){
        super(`Unprocessable value ${String(val)} at ${index}`)
    }
}

class TemplateError extends Error{
    constructor(e){
        super(`There are errors in template: ${e.message}`);
        this.err=e;
    }
}

module.exports={ConstReInit,UnprocessableValue,TemplateError};