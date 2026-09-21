/**
 * @arf-os/event-bus — domain event contracts and in-process bus.
 *
 * Milestone 1: typed domain event contracts + a simple in-process bus
 * that routes events to registered handlers. Production delivery uses
 * the transactional outbox table in PostgreSQL (see packages/db).
 *
 * Key rules from CLAUDE.md §9.3:
 * - Use an outbox table when a domain event must be emitted reliably after a transaction.
 * Every event contains: event ID, event type + version, aggregate ID + version,
 * correlation ID, causation ID, actor, timestamp, payload, trace ID.
 */

import { uuidv7 } from "uuidv7";

// ── Domain event envelope ─────────────────────────────────────────────────────

export interface DomainEvent<T extends string = string, P = unknown> {
  eventId: string;
  eventType: T;
  eventVersion: string;
  aggregateType: string;
  aggregateId: string;
  correlationId: string;
  causationId?: string;
  actorId: string;
  occurredAt: string;          // ISO-8601 UTC
  traceId?: string;
  payload: P;
}

// ── Event types for this milestone ───────────────────────────────────────────

export type CampaignCreated = DomainEvent<"campaign.created", { name: string; orgId: string }>;
export type StrategyVersionCreated = DomainEvent<"strategy_version.created", { strategyId: string; versionNumber: number }>;
export type PineCompileFailed = DomainEvent<"pine_compile.failed", { pineRevisionId: string; errors: string[] }>;
export type BacktestCompleted = DomainEvent<"backtest.completed", { backtestRunId: string; tradeCount: number }>;
export type BacktestParityFailed = DomainEvent<"backtest.parity_failed", { parityReportId: string; status: string }>;
export type CommitteeDecisionCreated = DomainEvent<"committee_decision.created", { decisionId: string; decision: string }>;
export type ForwardSignalReceived = DomainEvent<"forward_signal.received", { deploymentId: string; eventType: string }>;

export type AnyDomainEvent =
  | CampaignCreated
  | StrategyVersionCreated
  | PineCompileFailed
  | BacktestCompleted
  | BacktestParityFailed
  | CommitteeDecisionCreated
  | ForwardSignalReceived;

// ── Event factory ─────────────────────────────────────────────────────────────

export function createEvent<T extends string, P>(
  params: Omit<DomainEvent<T, P>, "eventId" | "occurredAt">,
): DomainEvent<T, P> {
  return {
    ...params,
    eventId: uuidv7(),
    occurredAt: new Date().toISOString(),
  };
}

// ── In-process event bus (development / test) ─────────────────────────────────

type EventHandler<T extends DomainEvent = DomainEvent> = (event: T) => Promise<void> | void;

export class InProcessEventBus {
  private handlers = new Map<string, EventHandler[]>();

  on<T extends DomainEvent>(eventType: T["eventType"], handler: EventHandler<T>): void {
    const existing = this.handlers.get(eventType) ?? [];
    this.handlers.set(eventType, [...existing, handler as EventHandler]);
  }

  async emit(event: DomainEvent): Promise<void> {
    const handlers = this.handlers.get(event.eventType) ?? [];
    await Promise.all(handlers.map((h) => h(event)));
  }

  clear(): void {
    this.handlers.clear();
  }
}

export const inProcessBus = new InProcessEventBus();
