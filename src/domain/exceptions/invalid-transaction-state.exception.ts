import { DomainException } from "./domain.exception";

export class InvalidTransactionStateException extends DomainException {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTransactionStateException";
  }
}