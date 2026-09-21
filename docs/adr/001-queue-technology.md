# ADR-001: Queue Technology — BullMQ + Redis

**Status:** Accepted

## Context

ARF-OS runs several categories of background work: model inference calls, Pine source compilation and backtesting, metric calculation, TradingView report ingestion, and paper-execution signal processing. Each category has different latency tolerance, retry semantics, and concurrency requirements. We needed a job queue that fits a TypeScript monorepo, runs on self-hosted infrastructure without a managed broker, supports priority lanes and rate limiting, and integrates cleanly with the Redis instance we already require for session caching and idempotency key storage.

## Decision

Use **BullMQ** as the queue library with **Redis** as the broker. Each worker application (`worker-research`, `worker-backtest`, `worker-analytics`, `worker-forward`) defines its own named queues and processes jobs independently. The API server enqueues jobs but never processes them. Workers execute a job, persist output artefacts, and emit a result event — they do not call the workflow engine or write lifecycle state directly. State transitions are applied by the API layer in response to those events, which preserves the invariant described in CLAUDE.md §3.2.

Job payloads are validated with Zod schemas from `packages/contracts` before enqueue and again inside each worker at the top of the process function. Job IDs are deterministic where idempotency is required (e.g., backtest run ID as the BullMQ job ID), preventing duplicate execution on retry.

## Alternatives

**AWS SQS + Lambda** — eliminates operational burden but couples the platform to AWS, adds cold-start latency to interactive flows, and makes local development significantly harder. Rejected for MVP.

**Temporal** — provides durable workflow execution and replay, which is attractive for long-running research pipelines. Considered for a future phase; rejected for MVP because it introduces a substantial operational dependency and the state machine is already implemented in `packages/workflow`.

**In-process async** — viable only for a single-node prototype. Rejected because it cannot survive process restarts and cannot scale workers independently.

## Consequences

- Redis becomes a required infrastructure dependency alongside PostgreSQL.
- Worker failures are automatically retried with configurable backoff; dead-letter queues capture exhausted jobs for inspection.
- Queue depth and job latency must be instrumented (see CLAUDE.md §20) to detect backpressure before it impacts research throughput.
- If Redis becomes unavailable, job processing pauses but the API remains available for reads.

## Security implications

Redis must not be exposed on a public interface. Use `requirepass` or ACL-based authentication in all non-development environments. Job payloads may contain strategy IDs and organisation IDs but must never contain raw secrets, model prompts, or exchange credentials. Workers run with least-privilege service accounts.

## Migration/rollback

BullMQ stores job state in Redis hashes and sorted sets. Rolling back to a prior BullMQ version is possible as long as the data format is compatible. If the queue technology must be replaced, the abstraction boundary is the enqueue call in each application service — a new adapter can be swapped without changing workflow or worker logic.
