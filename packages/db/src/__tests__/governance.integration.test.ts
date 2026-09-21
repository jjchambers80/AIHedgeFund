/**
 * Integration tests: audit_events, idempotency_records, outbox_events
 * Verifies append-only audit semantics, idempotency key uniqueness,
 * and outbox event patterns.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, closeDb } from "../client.js";
import { auditEvents, idempotencyRecords, outboxEvents } from "../schema/index.js";
import {
  makeId,
  createOrg,
  createUser,
  createAuditEvent,
  cleanup,
} from "./helpers.js";

let orgId: string;
let userId: string;
const createdAuditIds: string[] = [];
const createdIdempotencyIds: string[] = [];
const createdOutboxIds: string[] = [];

beforeAll(async () => {
  const org = await createOrg({ name: "Governance Test Org" });
  orgId = org.id;
  const user = await createUser(orgId);
  userId = user.id;
});

afterAll(async () => {
  const db = getDb();
  if (createdOutboxIds.length) {
    for (const id of createdOutboxIds) {
      await db.delete(outboxEvents).where(eq(outboxEvents.id, id)).catch(() => {});
    }
  }
  await cleanup({
    idempotencyIds: createdIdempotencyIds,
    auditIds: createdAuditIds,
    userIds: [userId],
    orgIds: [orgId],
  });
  await closeDb();
});

describe("audit_events", () => {
  it("creates an audit event", async () => {
    const aggregateId = makeId();
    const event = await createAuditEvent(
      orgId,
      userId,
      "CAMPAIGN_CREATED",
      "Campaign",
      aggregateId,
    );
    createdAuditIds.push(event.id);
    expect(event.orgId).toBe(orgId);
    expect(event.action).toBe("CAMPAIGN_CREATED");
    expect(event.actorId).toBe(userId);
    expect(event.aggregateType).toBe("Campaign");
    expect(event.aggregateId).toBe(aggregateId);
    expect(event.createdAt).toBeInstanceOf(Date);
  });

  it("stores prior and new state summaries as jsonb", async () => {
    const db = getDb();
    const id = makeId();
    await db.insert(auditEvents).values({
      id,
      orgId,
      actorType: "USER",
      actorId: userId,
      action: "STATUS_CHANGED",
      aggregateType: "Campaign",
      aggregateId: makeId(),
      priorStateSummary: { status: "CAMPAIGN_BACKLOG" } as unknown as never,
      newStateSummary: { status: "IDEA_RESEARCH" } as unknown as never,
      reason: "User advanced workflow",
    });
    createdAuditIds.push(id);
    const [found] = await db.select().from(auditEvents).where(eq(auditEvents.id, id));
    expect(found!.priorStateSummary).toEqual({ status: "CAMPAIGN_BACKLOG" });
    expect(found!.newStateSummary).toEqual({ status: "IDEA_RESEARCH" });
    expect(found!.reason).toBe("User advanced workflow");
  });

  it("accumulates multiple events for same aggregate (append-only)", async () => {
    const db = getDb();
    const aggregateId = makeId();
    const actions = ["CREATED", "UPDATED", "REVIEWED"];
    for (const action of actions) {
      const id = makeId();
      await db.insert(auditEvents).values({
        id,
        orgId,
        actorType: "USER",
        actorId: userId,
        action,
        aggregateType: "Strategy",
        aggregateId,
      });
      createdAuditIds.push(id);
    }
    const rows = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.aggregateId, aggregateId));
    expect(rows.length).toBe(3);
    expect(rows.map((r) => r.action).sort()).toEqual(actions.sort());
  });

  it("scopes audit events by org", async () => {
    const db = getDb();
    const otherOrg = await createOrg({ name: "Other Audit Org" });
    const id = makeId();
    await db.insert(auditEvents).values({
      id,
      orgId: otherOrg.id,
      actorType: "SYSTEM",
      actorId: "system",
      action: "OTHER_ORG_ACTION",
      aggregateType: "Campaign",
      aggregateId: makeId(),
    });
    const rows = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.orgId, orgId));
    expect(rows.some((r) => r.id === id)).toBe(false);
    // Cleanup — delete audit event first, then org
    await db.delete(auditEvents).where(eq(auditEvents.id, id));
    const { organisations: orgsTable } = await import("../schema/index.js");
    await db.delete(orgsTable).where(eq(orgsTable.id, otherOrg.id));
  });
});

describe("idempotency_records", () => {
  it("creates an idempotency record", async () => {
    const db = getDb();
    const id = makeId();
    const key = `create-campaign:${makeId()}`;
    const expiresAt = new Date(Date.now() + 86400_000); // 24h
    const [record] = await db
      .insert(idempotencyRecords)
      .values({
        id,
        idempotencyKey: key,
        requestHash: "sha256:abc123",
        actorId: userId,
        expiresAt,
      })
      .returning();
    createdIdempotencyIds.push(id);
    expect(record!.idempotencyKey).toBe(key);
    expect(record!.requestHash).toBe("sha256:abc123");
    expect(record!.actorId).toBe(userId);
  });

  it("enforces unique idempotency key", async () => {
    const db = getDb();
    const key = `unique-key:${makeId()}`;
    const expiresAt = new Date(Date.now() + 86400_000);
    const id1 = makeId();
    await db.insert(idempotencyRecords).values({
      id: id1,
      idempotencyKey: key,
      requestHash: "sha256:first",
      actorId: userId,
      expiresAt,
    });
    createdIdempotencyIds.push(id1);
    // Second insert with same key must fail
    await expect(
      db.insert(idempotencyRecords).values({
        id: makeId(),
        idempotencyKey: key,
        requestHash: "sha256:second",
        actorId: userId,
        expiresAt,
      }),
    ).rejects.toThrow();
  });

  it("stores response ref after processing", async () => {
    const db = getDb();
    const id = makeId();
    const key = `with-response:${makeId()}`;
    await db.insert(idempotencyRecords).values({
      id,
      idempotencyKey: key,
      requestHash: "sha256:req",
      responseRef: "campaign:abc-123",
      actorId: userId,
      expiresAt: new Date(Date.now() + 3600_000),
    });
    createdIdempotencyIds.push(id);
    const [found] = await db
      .select()
      .from(idempotencyRecords)
      .where(eq(idempotencyRecords.id, id));
    expect(found!.responseRef).toBe("campaign:abc-123");
  });

  it("allows same actor to use different keys", async () => {
    const db = getDb();
    const key1 = `key-a:${makeId()}`;
    const key2 = `key-b:${makeId()}`;
    const expiresAt = new Date(Date.now() + 3600_000);
    const id1 = makeId();
    const id2 = makeId();
    await db.insert(idempotencyRecords).values([
      { id: id1, idempotencyKey: key1, requestHash: "sha256:a", actorId: userId, expiresAt },
      { id: id2, idempotencyKey: key2, requestHash: "sha256:b", actorId: userId, expiresAt },
    ]);
    createdIdempotencyIds.push(id1, id2);
    const rows = await db
      .select()
      .from(idempotencyRecords)
      .where(eq(idempotencyRecords.actorId, userId));
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });
});

describe("outbox_events", () => {
  it("creates an outbox event with a jsonb event payload", async () => {
    const db = getDb();
    const id = makeId();
    const payload = {
      type: "CampaignCreated",
      aggregateId: makeId(),
      orgId,
      data: { title: "Test Campaign" },
    };
    const [event] = await db
      .insert(outboxEvents)
      .values({ id, event: payload as unknown as never })
      .returning();
    createdOutboxIds.push(id);
    expect(event!.event).toEqual(payload);
    expect(event!.attempts).toBe(0);
    expect(event!.publishedAt).toBeNull();
  });

  it("marks outbox event as published", async () => {
    const db = getDb();
    const id = makeId();
    await db.insert(outboxEvents).values({
      id,
      event: { type: "StrategyVersionCreated", data: {} } as unknown as never,
    });
    createdOutboxIds.push(id);
    await db
      .update(outboxEvents)
      .set({ publishedAt: new Date() })
      .where(eq(outboxEvents.id, id));
    const [found] = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.id, id));
    expect(found!.publishedAt).toBeInstanceOf(Date);
  });

  it("increments attempts counter", async () => {
    const db = getDb();
    const id = makeId();
    await db.insert(outboxEvents).values({
      id,
      event: { type: "RetryableEvent" } as unknown as never,
    });
    createdOutboxIds.push(id);
    await db
      .update(outboxEvents)
      .set({ attempts: 3 })
      .where(eq(outboxEvents.id, id));
    const [found] = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.id, id));
    expect(found!.attempts).toBe(3);
  });
});
