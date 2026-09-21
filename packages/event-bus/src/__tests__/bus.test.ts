/**
 * Unit tests for @arf-os/event-bus.
 *
 * Tests createEvent factory and InProcessEventBus handler routing.
 * Domain event contracts must satisfy the envelope requirements from
 * AI_RESEARCH_HEDGE_FUND_SPEC.md §8 and CLAUDE.md §9.3.
 */
import { describe, it, expect, vi } from "vitest";
import { createEvent, InProcessEventBus } from "../index.js";
import type { DomainEvent } from "../index.js";

describe("createEvent", () => {
  it("generates a unique eventId and sets occurredAt", () => {
    const event = createEvent({
      eventType: "campaign.created",
      eventVersion: "1.0",
      aggregateType: "campaign",
      aggregateId: "campaign-1",
      correlationId: "corr-1",
      actorId: "user-1",
      payload: { name: "BTC Research", orgId: "org-1" },
    });

    expect(event.eventId).toBeTruthy();
    expect(event.eventId.length).toBeGreaterThan(10);
    expect(event.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(event.eventType).toBe("campaign.created");
    expect(event.payload).toEqual({ name: "BTC Research", orgId: "org-1" });
  });

  it("generates distinct IDs for separate events", () => {
    const a = createEvent({ eventType: "campaign.created", eventVersion: "1", aggregateType: "campaign", aggregateId: "1", correlationId: "c1", actorId: "u1", payload: {} });
    const b = createEvent({ eventType: "campaign.created", eventVersion: "1", aggregateType: "campaign", aggregateId: "1", correlationId: "c1", actorId: "u1", payload: {} });
    expect(a.eventId).not.toBe(b.eventId);
  });

  it("preserves optional fields when provided", () => {
    const event = createEvent({
      eventType: "backtest.completed",
      eventVersion: "1.0",
      aggregateType: "backtest_run",
      aggregateId: "run-1",
      correlationId: "corr-1",
      causationId: "task-1",
      actorId: "service-1",
      traceId: "trace-abc",
      payload: { backtestRunId: "run-1", tradeCount: 42 },
    });

    expect(event.causationId).toBe("task-1");
    expect(event.traceId).toBe("trace-abc");
  });
});

describe("InProcessEventBus", () => {
  it("delivers events to registered handlers", async () => {
    const bus = new InProcessEventBus();
    const handler = vi.fn();

    bus.on("campaign.created", handler);

    const event = createEvent({
      eventType: "campaign.created",
      eventVersion: "1",
      aggregateType: "campaign",
      aggregateId: "c1",
      correlationId: "cr1",
      actorId: "u1",
      payload: { name: "Test", orgId: "org-1" },
    });

    await bus.emit(event);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(event);
  });

  it("delivers to multiple handlers for the same event type", async () => {
    const bus = new InProcessEventBus();
    const h1 = vi.fn();
    const h2 = vi.fn();

    bus.on("backtest.completed", h1);
    bus.on("backtest.completed", h2);

    const event = createEvent({
      eventType: "backtest.completed",
      eventVersion: "1",
      aggregateType: "backtest_run",
      aggregateId: "run-1",
      correlationId: "cr1",
      actorId: "worker-1",
      payload: { backtestRunId: "run-1", tradeCount: 10 },
    });

    await bus.emit(event);
    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
  });

  it("does not deliver to handlers of a different event type", async () => {
    const bus = new InProcessEventBus();
    const campaignHandler = vi.fn();

    bus.on("campaign.created", campaignHandler);

    const event = createEvent({
      eventType: "backtest.completed",
      eventVersion: "1",
      aggregateType: "backtest_run",
      aggregateId: "run-1",
      correlationId: "cr1",
      actorId: "worker-1",
      payload: { backtestRunId: "run-1", tradeCount: 5 },
    });

    await bus.emit(event);
    expect(campaignHandler).not.toHaveBeenCalled();
  });

  it("delivers nothing when no handlers registered", async () => {
    const bus = new InProcessEventBus();
    const event = createEvent({
      eventType: "committee_decision.created" as DomainEvent["eventType"],
      eventVersion: "1",
      aggregateType: "committee_decision",
      aggregateId: "dec-1",
      correlationId: "cr1",
      actorId: "u1",
      payload: { decisionId: "dec-1", decision: "REJECT" },
    });
    // Should not throw
    await expect(bus.emit(event)).resolves.toBeUndefined();
  });

  it("clears all handlers", async () => {
    const bus = new InProcessEventBus();
    const handler = vi.fn();
    bus.on("campaign.created", handler);
    bus.clear();

    const event = createEvent({
      eventType: "campaign.created",
      eventVersion: "1",
      aggregateType: "campaign",
      aggregateId: "c1",
      correlationId: "cr1",
      actorId: "u1",
      payload: { name: "Test", orgId: "org-1" },
    });
    await bus.emit(event);
    expect(handler).not.toHaveBeenCalled();
  });
});
