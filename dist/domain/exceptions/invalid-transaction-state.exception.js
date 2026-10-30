"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvalidTransactionStateException = void 0;
const domain_exception_1 = require("./domain.exception");
class InvalidTransactionStateException extends domain_exception_1.DomainException {
    constructor(message) {
        super(message);
        this.name = "InvalidTransactionStateException";
    }
}
exports.InvalidTransactionStateException = InvalidTransactionStateException;
//# sourceMappingURL=invalid-transaction-state.exception.js.map