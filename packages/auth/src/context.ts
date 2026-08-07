/** The auth context available to every request handler. */
export interface AuthContext {
  userId: string;
  orgId: string;
  role: string;
  /** true when running in stub mode (local dev) */
  isStub: boolean;
}
