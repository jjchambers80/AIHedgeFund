/**
 * Unit tests for @arf-os/agent-runtime.
 *
 * Tests the DeterministicProvider (used in development and CI)
 * and the AgentRuntimeError class.
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  DeterministicProvider,
  AgentRuntimeError,
  generateStructuredWithRetry,
  type ModelProvider,
  type StructuredGenerationRequest,
  type StructuredGenerationResult,
} from "../index.js";

describe("DeterministicProvider", () => {
  const outputSchema = z.object({
    title: z.string(),
    recommendation: z.enum(["RESEARCH", "PARK", "REJECT"]),
    noveltyScore: z.number().min(0).max(10),
  });

  const validFixture = {
    title: "Momentum Reversal on BTC",
    recommendation: "RESEARCH",
    noveltyScore: 7,
  };

  it("returns the fixture when it matches the schema", async () => {
    const provider = new DeterministicProvider(validFixture);
    const result = await provider.generateStructured({
      promptVersion: "sha256:abc123",
      input: { topic: "btc momentum" },
      outputSchema,
    });

    expect(result.output.title).toBe("Momentum Reversal on BTC");
    expect(result.output.recommendation).toBe("RESEARCH");
    expect(result.retries).toBe(0);
    expect(result.costUsd).toBe(0);
    expect(result.inputTokens).toBe(0);
  });

  it("uses the configured model name", async () => {
    const provider = new DeterministicProvider(validFixture, "my-fixture-v2");
    const result = await provider.generateStructured({
      promptVersion: "sha256:abc123",
      input: {},
      outputSchema,
    });
    expect(result.model).toBe("my-fixture-v2");
  });

  it("preserves the raw provider output for diagnostics", async () => {
    const provider = new DeterministicProvider(validFixture);
    const result = await provider.generateStructured({
      promptVersion: "sha256:abc123",
      input: {},
      outputSchema,
    });
    expect(result.rawProviderOutput).toEqual(validFixture);
  });

  it("throws AgentRuntimeError when fixture does not match schema", async () => {
    const badFixture = { title: "Missing fields" };
    const provider = new DeterministicProvider(badFixture);

    await expect(
      provider.generateStructured({
        promptVersion: "sha256:abc123",
        input: {},
        outputSchema,
      }),
    ).rejects.toThrow(AgentRuntimeError);
  });

  it("throws with SCHEMA_VALIDATION_FAILED code on mismatch", async () => {
    const badFixture = { title: 123, recommendation: "GO_LONG", noveltyScore: "high" };
    const provider = new DeterministicProvider(badFixture);

    try {
      await provider.generateStructured({ promptVersion: "", input: {}, outputSchema });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(AgentRuntimeError);
      expect((e as AgentRuntimeError).code).toBe("SCHEMA_VALIDATION_FAILED");
    }
  });
});

describe("generateStructuredWithRetry", () => {
  const outputSchema = z.object({ title: z.string() });

  it("returns the first attempt's result untouched when it already succeeds", async () => {
    const provider = new DeterministicProvider({ title: "ok" });
    const result = await generateStructuredWithRetry(provider, {
      promptVersion: "v1",
      input: {},
      outputSchema,
    });
    expect(result.output.title).toBe("ok");
    expect(result.retries).toBe(0);
  });

  it("retries exactly once on SCHEMA_VALIDATION_FAILED, passing the validation error back", async () => {
    const attempts: Array<StructuredGenerationRequest<unknown, unknown>> = [];
    let call = 0;
    const flaky = {
      async generateStructured<TInput, TOutput>(request: StructuredGenerationRequest<TInput, TOutput>) {
        attempts.push(request as unknown as StructuredGenerationRequest<unknown, unknown>);
        call++;
        if (call === 1) {
          throw new AgentRuntimeError("SCHEMA_VALIDATION_FAILED", "title: Required");
        }
        const result: StructuredGenerationResult<TOutput> = {
          output: { title: "recovered" } as TOutput,
          providerRunId: "run-2",
          model: "flaky-v1",
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
          retries: 0,
          rawProviderOutput: { title: "recovered" },
        };
        return result;
      },
    } satisfies ModelProvider;

    const result = await generateStructuredWithRetry(flaky, {
      promptVersion: "v1",
      input: {},
      outputSchema,
    });

    expect(call).toBe(2);
    expect(attempts[1]!.previousValidationError).toBe("title: Required");
    expect(result.retries).toBe(1);
    expect((result.output as { title: string }).title).toBe("recovered");
  });

  it("propagates the error when both attempts fail schema validation", async () => {
    const badFixture = { wrong: "shape" };
    const provider = new DeterministicProvider(badFixture);

    await expect(
      generateStructuredWithRetry(provider, { promptVersion: "v1", input: {}, outputSchema }),
    ).rejects.toThrow(AgentRuntimeError);
  });

  it("does not retry non-schema errors", async () => {
    let call = 0;
    const provider = {
      async generateStructured<TInput, TOutput>(
        _request: StructuredGenerationRequest<TInput, TOutput>,
      ): Promise<StructuredGenerationResult<TOutput>> {
        call++;
        throw new AgentRuntimeError("PROVIDER_TIMEOUT", "timed out");
      },
    } satisfies ModelProvider;

    await expect(
      generateStructuredWithRetry(provider, { promptVersion: "v1", input: {}, outputSchema }),
    ).rejects.toThrow("timed out");
    expect(call).toBe(1);
  });
});

describe("AgentRuntimeError", () => {
  it("carries the error code and message", () => {
    const err = new AgentRuntimeError("PROVIDER_TIMEOUT", "Provider timed out after 30s");
    expect(err.code).toBe("PROVIDER_TIMEOUT");
    expect(err.message).toBe("Provider timed out after 30s");
    expect(err.name).toBe("AgentRuntimeError");
    expect(err).toBeInstanceOf(Error);
  });
});
