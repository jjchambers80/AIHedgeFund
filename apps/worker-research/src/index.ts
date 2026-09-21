/**
 * worker-research — LLM research job executor.
 *
 * Executes role prompts (Idea Scout, Indicator Researcher, Strategy Architect, etc.),
 * validates structured model output via Zod, stores artefacts, and emits result events.
 *
 * Architecture rules (CLAUDE.md §3.2, §11):
 * - Workers do NOT directly change workflow state.
 * - All model output is validated with Zod before being stored.
 * - Raw provider output is preserved in protected diagnostics storage, never in UI records.
 * - Every agent run stores: role, prompt version, cost, retries, artefact references.
 *
 * Milestone 1: wires the IDEA_SCOUT role through a DeterministicProvider fixture.
 */

import { logger } from "@arf-os/observability";
import { DeterministicProvider } from "@arf-os/agent-runtime";

const SERVICE_NAME = "worker-research";
const VERSION = "0.1.0";

logger.info(
  { service: SERVICE_NAME, version: VERSION },
  "worker-research starting (milestone 1: DeterministicProvider only)",
);

// Verify agent-runtime wiring by instantiating the fixture provider.
const _devProvider = new DeterministicProvider({}, "deterministic-fixture-v1");
logger.info({ service: SERVICE_NAME }, "Agent runtime ready (provider: DeterministicProvider)");

// Graceful shutdown.
process.on("SIGTERM", () => {
  logger.info({ service: SERVICE_NAME }, "SIGTERM received — shutting down");
  process.exit(0);
});

process.on("SIGINT", () => {
  logger.info({ service: SERVICE_NAME }, "SIGINT received — shutting down");
  process.exit(0);
});
