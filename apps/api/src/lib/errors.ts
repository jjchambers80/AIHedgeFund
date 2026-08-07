/** Typed domain errors for the API layer. */

export class NotFoundError extends Error {
  readonly statusCode = 404;
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`);
    this.name = "NotFoundError";
  }
}

export class DomainValidationError extends Error {
  readonly statusCode = 422;
  readonly issues: unknown;
  constructor(message: string, issues?: unknown) {
    super(message);
    this.name = "DomainValidationError";
    this.issues = issues;
  }
}

export class ConflictError extends Error {
  readonly statusCode = 409;
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}
