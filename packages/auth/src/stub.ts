/**
 * Stub auth provider for local development.
 *
 * When STUB_AUTH=true the middleware reads:
 *   X-Stub-User-Id   (defaults to STUB_USER_ID env or "user_dev")
 *   X-Stub-Org-Id    (defaults to STUB_ORG_ID env or "org_dev")
 *   X-Stub-Role      (defaults to "ADMIN")
 *
 * NEVER enable in production — guarded by the middleware.
 */
import type { AuthContext } from "./context.js";

export function stubAuthFromHeaders(headers: Record<string, string | string[] | undefined>): AuthContext {
  const get = (key: string) => {
    const v = headers[key.toLowerCase()];
    return Array.isArray(v) ? v[0] : v;
  };
  return {
    userId: get("x-stub-user-id") ?? process.env["STUB_USER_ID"] ?? "user_dev",
    orgId: get("x-stub-org-id") ?? process.env["STUB_ORG_ID"] ?? "org_dev",
    role: get("x-stub-role") ?? "ADMIN",
    isStub: true,
  };
}

export function isStubMode(): boolean {
  return process.env["STUB_AUTH"] === "true";
}
