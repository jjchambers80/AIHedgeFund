# ADR-003: Workflow Engine — Internal State Machine in packages/workflow

**Status:** Accepted

## Context

A strategy version travels through a well-defined lifecycle: from initial draft through backtesting, statistical validation, robustness checks, TradingView parity verification, committee review, and finally forward deployment or rejection. Each transition has preconditions (required evidence, role permissions, hard-fail checks), produces an audit record, and may require explicit human approval. This logic is the most security-critical and reproducibility-critical part of the platform — it must be deterministic, testable, and version-pinned.

The system also runs background workers that produce evidence consumed by transition guards. Allowing workers to write lifecycle state directly would scatter transition policy across multiple processes and make it impossible to enforce preconditions consistently.

## Decision

Implement a **custom state machine** in `packages/workflow`. The engine exposes a single typed `transition()` command that takes the current state, desired state, actor context, evidence IDs, and policy version. It returns a typed success or typed rejection — it does not throw for expected policy failures. Callers check the return type and act accordingly.

Workers are explicitly prohibited from calling `transition()`. A worker's contract is: execute the job, store output artefacts in object storage, write result rows to the database, and return. The API layer observes worker completion events and calls `transition()` if the policy permits. This boundary is enforced in code review and integration tests.

The allowed-transition table, required evidence per transition, role requirements, and human-approval flags all live inside `packages/workflow`. No route handler contains transition logic. Route handlers authenticate, authorise, validate the request, call an application service, and return — the application service calls the workflow engine.

Policy is versioned. Each `CommitteeDecision` record stores the policy version under which it was evaluated.

## Alternatives

**Temporal** — durable workflow execution with replay would simplify long-running pipeline recovery. Considered and deferred. The operational overhead of running a Temporal cluster is not justified for MVP, and the state machine is small enough to implement and test directly. If pipeline durations grow beyond minutes or retry complexity increases substantially, Temporal should be revisited.

**XState** — a mature state machine library for TypeScript. Considered but the configuration DSL adds a learning dependency without providing the domain-specific evidence and role checks ARF-OS needs. Building a small internal engine requires roughly the same effort with no external dependency.

**Workflow state scattered across route handlers** — the status quo in many research tools. Explicitly rejected because it makes policy auditing impossible and creates divergent transition paths.

## Consequences

- All lifecycle state changes flow through a single, well-tested code path.
- Adding a new transition requires updating `packages/workflow` and its tests, which creates a natural review gate.
- Workers must be monitored for jobs that complete without triggering a transition — this indicates a missing event handler in the API layer.
- The engine is synchronous and in-process; it does not itself provide durability. Durability comes from the PostgreSQL transaction that wraps each `transition()` call together with the audit event write.

## Security implications

The workflow engine enforces role separation at the policy level. It must verify that the creator of a strategy version is not also its sole validator, that the validator cannot modify source, and that human-override decisions are explicitly flagged and audited. These checks must not be bypassable by passing a permissive actor context. Integration tests must cover each separation-of-duties boundary with a negative case.

## Migration/rollback

Policy versions are stored alongside every decision record. If a policy change is later found to be incorrect, historical decisions can be re-evaluated against the original policy version for audit purposes. Rolling back the policy in code requires a migration to the policy version field and a re-evaluation pass for any in-flight strategy versions that were evaluated under the incorrect policy.
