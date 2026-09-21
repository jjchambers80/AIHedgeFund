/**
 * @arf-os/agent-runtime — provider-agnostic model adapter layer.
 *
 * Milestone 1: interfaces and stub provider only.
 * Live provider adapters (Anthropic, OpenAI) are added in a later milestone.
 *
 * Key rules from CLAUDE.md §11:
 * - Model providers implement a small, stable interface.
 * - Provider adapters must not contain research workflow logic.
 * - All output is schema-validated via Zod before being stored.
 * - Raw provider output is preserved in protected diagnostics storage.
 */

import { z } from "zod";

// ── Provider interface ────────────────────────────────────────────────────────

export interface StructuredGenerationRequest<TInput, TOutput> {
  /** Versioned role prompt — must be an approved, active prompt record. */
  promptVersion: string;
  /** Structured task input validated by the caller before passing here. */
  input: TInput;
  /** Zod schema used to validate and parse the model's JSON output. */
  outputSchema: z.ZodType<TOutput>;
  /** Max tokens the provider should generate. */
  maxOutputTokens?: number;
  /** Provider-specific model name override (optional). */
  modelOverride?: string;
  /**
   * Set by `generateStructuredWithRetry` on the retry attempt — the exact
   * Zod validation error from the first attempt, so a real provider adapter
   * can fold it back into the prompt (CLAUDE.md §11.3 step 5: "retry once
   * with exact validation errors"). Absent on the first attempt.
   */
  previousValidationError?: string;
}

export interface StructuredGenerationResult<TOutput> {
  /** Validated structured output. */
  output: TOutput;
  /** Provider-assigned run or completion ID. */
  providerRunId: string;
  /** Model identifier as reported by the provider. */
  model: string;
  /** Input token count. */
  inputTokens: number;
  /** Output token count. */
  outputTokens: number;
  /** Cost in USD (0 for stub). */
  costUsd: number;
  /** Number of validation retries used (0 or 1). */
  retries: number;
  /** Raw provider response — stored in protected diagnostics, never sent to UI. */
  rawProviderOutput: unknown;
}

export interface ModelProvider {
  generateStructured<TInput, TOutput>(
    request: StructuredGenerationRequest<TInput, TOutput>,
  ): Promise<StructuredGenerationResult<TOutput>>;
}

// ── Stub / deterministic fixture provider ────────────────────────────────────

/**
 * DeterministicProvider always returns a predefined fixture output.
 * Used in development and tests when a real model provider is not available.
 */
export class DeterministicProvider implements ModelProvider {
  constructor(
    private readonly fixture: unknown,
    private readonly modelName: string = "deterministic-fixture-v1",
  ) {}

  async generateStructured<TInput, TOutput>(
    request: StructuredGenerationRequest<TInput, TOutput>,
  ): Promise<StructuredGenerationResult<TOutput>> {
    const parsed = request.outputSchema.safeParse(this.fixture);
    if (!parsed.success) {
      throw new AgentRuntimeError(
        "SCHEMA_VALIDATION_FAILED",
        `Fixture does not match output schema: ${parsed.error.message}`,
      );
    }
    return {
      output: parsed.data,
      providerRunId: `fixture-${Date.now()}`,
      model: this.modelName,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      retries: 0,
      rawProviderOutput: this.fixture,
    };
  }
}

/**
 * Wraps `ModelProvider.generateStructured` with the retry policy from
 * CLAUDE.md §11.3: on schema validation failure, retry exactly once with
 * the validation error attached to the request; if the retry also fails,
 * propagate the error (the caller marks the run failed, per step 6).
 *
 * This lives at the wrapper level rather than inside each provider so every
 * provider adapter gets the same retry behaviour for free.
 */
export async function generateStructuredWithRetry<TInput, TOutput>(
  provider: ModelProvider,
  request: StructuredGenerationRequest<TInput, TOutput>,
): Promise<StructuredGenerationResult<TOutput>> {
  try {
    return await provider.generateStructured(request);
  } catch (err) {
    if (!(err instanceof AgentRuntimeError) || err.code !== "SCHEMA_VALIDATION_FAILED") {
      throw err;
    }
    const retryResult = await provider.generateStructured({
      ...request,
      previousValidationError: err.message,
    });
    return { ...retryResult, retries: 1 };
  }
}

// ── Agent run record ──────────────────────────────────────────────────────────

export interface AgentRunRecord {
  id: string;
  campaignId: string;
  taskId: string;
  role: string;
  promptVersion: string;
  providerRunId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  retries: number;
  status: "SUCCEEDED" | "FAILED" | "SCHEMA_INVALID";
  /** Reference to the protected diagnostics artefact (raw provider output). */
  diagnosticsArtefactId?: string;
  createdAt: string;
  completedAt?: string;
}

// ── Errors ────────────────────────────────────────────────────────────────────

export type AgentRuntimeErrorCode =
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_RATE_LIMITED"
  | "SCHEMA_VALIDATION_FAILED"
  | "PROMPT_NOT_APPROVED"
  | "BUDGET_EXCEEDED"
  | "INVALID_TOOL_USE";

export class AgentRuntimeError extends Error {
  constructor(
    public readonly code: AgentRuntimeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AgentRuntimeError";
  }
}
