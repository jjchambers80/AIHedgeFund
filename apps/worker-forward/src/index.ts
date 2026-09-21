/**
 * worker-forward — TradingView webhook ingestion and paper execution worker.
 *
 * Milestone 1 placeholder: health check + domain package wiring.
 * Signal ingestion and paper execution are implemented in a later milestone.
 *
 * Architecture rules (CLAUDE.md §3.2):
 * - Workers do NOT directly change strategy lifecycle state.
 * - Workers execute a job, store outputs, emit a domain event, then let
 *   the orchestrator/API apply transition policy.
 *
 * Forward-test rules (CLAUDE.md §16):
 * - Signal endpoint must validate: deployment state, strategy version,
 *   symbol/timeframe, timestamp tolerance, idempotency key.
 * - Do NOT execute paper logic synchronously in the webhook request.
 * - Paper execution is deterministic and versioned.
 */

import Fastify from "fastify";
import { logger } from "@arf-os/observability";
import { inProcessBus } from "@arf-os/event-bus";

const SERVICE_NAME = "worker-forward";
const VERSION = "0.1.0";
const PORT = Number(process.env["PORT"] ?? 3003);

logger.info({ service: SERVICE_NAME, version: VERSION }, "worker-forward starting (milestone 1 placeholder)");

// Domain event subscriptions (no-op until signal ingestion is implemented).
inProcessBus.on("forward_signal.received", async (event) => {
  logger.info({ eventId: event.eventId }, "forward_signal.received (no-op placeholder)");
});

// Real health/readiness endpoints (CLAUDE.md §16.3: deployment health is
// infrastructure state, distinct from strategy performance, and must be
// probeable — a log line is not a health check).
const healthServer = Fastify({ logger: false });
healthServer.get("/health", async () => ({ status: "ok", service: SERVICE_NAME, version: VERSION }));
healthServer.get("/ready", async () => ({ status: "ready" }));

await healthServer.listen({ port: PORT, host: "0.0.0.0" });
logger.info({ service: SERVICE_NAME, port: PORT }, "Health server listening");

// Graceful shutdown.
process.on("SIGTERM", () => {
  logger.info({ service: SERVICE_NAME }, "SIGTERM received — shutting down");
  void healthServer.close().finally(() => process.exit(0));
});

process.on("SIGINT", () => {
  logger.info({ service: SERVICE_NAME }, "SIGINT received — shutting down");
  void healthServer.close().finally(() => process.exit(0));
});
