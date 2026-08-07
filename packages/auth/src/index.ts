export type { AuthContext } from "./context.js";
export { stubAuthFromHeaders, isStubMode } from "./stub.js";

/** Thrown when an org-ownership check fails. */
export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Thrown when the request is not authenticated. */
export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/**
 * Assert that the resource's orgId matches the caller's orgId.
 * Call this on every aggregate read/write.
 */
export function assertOrgAccess(callerOrgId: string, resourceOrgId: string): void {
  if (callerOrgId !== resourceOrgId) {
    throw new ForbiddenError("Resource belongs to a different organisation");
  }
}
