import { createHash } from "node:crypto";

/** SHA-256 hash of Pine source text. Used for immutability checks and parity. */
export function hashSource(source: string): string {
  return createHash("sha256").update(source, "utf8").digest("hex");
}

/** SHA-256 hash of a JSON-serialisable value (manifest, definition, etc.). Stable across key order. */
export function hashJson(value: unknown): string {
  const stable = JSON.stringify(value, (_key, val: unknown) => {
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      return Object.fromEntries(
        Object.entries(val as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
      );
    }
    return val;
  });
  return createHash("sha256").update(stable, "utf8").digest("hex");
}
