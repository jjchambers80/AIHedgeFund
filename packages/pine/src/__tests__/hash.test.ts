import { describe, it, expect } from "vitest";
import { hashSource, hashJson } from "../hash.js";

describe("hashSource", () => {
  it("produces consistent SHA-256 for same input", () => {
    const h1 = hashSource("hello world");
    const h2 = hashSource("hello world");
    expect(h1).toBe(h2);
  });

  it("produces different hashes for different inputs", () => {
    expect(hashSource("version 1")).not.toBe(hashSource("version 2"));
  });

  it("returns a 64-character hex string", () => {
    expect(hashSource("test")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("hashJson", () => {
  it("is stable regardless of key order", () => {
    const h1 = hashJson({ b: 2, a: 1 });
    const h2 = hashJson({ a: 1, b: 2 });
    expect(h1).toBe(h2);
  });

  it("produces different hashes for different values", () => {
    expect(hashJson({ a: 1 })).not.toBe(hashJson({ a: 2 }));
  });

  it("handles nested objects stably", () => {
    const h1 = hashJson({ outer: { z: 3, a: 1 }, b: 2 });
    const h2 = hashJson({ b: 2, outer: { a: 1, z: 3 } });
    expect(h1).toBe(h2);
  });

  it("returns a 64-character hex string", () => {
    expect(hashJson({ x: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });
});
