import { DomainException } from "./domain.exception";
export declare class InvalidTransactionStateException extends DomainException {
    constructor(message: string);
}
