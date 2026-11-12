export type DomainErrorCategory =
  | "VALIDATION"
  | "NOT_FOUND"
  | "CONFLICT"
  | "BUSINESS_RULE"
  | "TRANSIENT_INFRA";

export class DomainException extends Error {
  public readonly category: DomainErrorCategory;
  public readonly code: string;

  constructor(
    message: string,
    category: DomainErrorCategory = "BUSINESS_RULE",
    code: string = "DOMAIN_ERROR",
  ) {
    super(message);
    this.name = "DomainException";
    this.category = category;
    this.code = code;
  }

  static validation(message: string, code: string = "INVALID_PAYLOAD"): DomainException {
    return new DomainException(message, "VALIDATION", code);
  }

  static notFound(message: string, code: string = "RESOURCE_NOT_FOUND"): DomainException {
    return new DomainException(message, "NOT_FOUND", code);
  }

  static conflict(message: string, code: string = "CONFLICT"): DomainException {
    return new DomainException(message, "CONFLICT", code);
  }

  static businessRule(message: string, code: string = "BUSINESS_RULE_VIOLATION"): DomainException {
    return new DomainException(message, "BUSINESS_RULE", code);
  }

  static transient(message: string, code: string = "TRANSIENT_INFRASTRUCTURE_ERROR"): DomainException {
    return new DomainException(message, "TRANSIENT_INFRA", code);
  }
}