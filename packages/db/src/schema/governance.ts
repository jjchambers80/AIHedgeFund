import { pgTable, text, timestamp, boolean, jsonb, index, unique, integer } from "drizzle-orm/pg-core";
import { organisations } from "./identity.js";
import { strategyVersions } from "./strategy.js";
import { tradingViewVerifications } from "./testing.js";

export const committeeDecisions = pgTable(
  "committee_decisions",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organisations.id),
    strategyVersionId: text("strategy_version_id")
      .notNull()
      .references(() => strategyVersions.id),
    decision: text("decision").notNull(),
    fromState: text("from_state").notNull(),
    toState: text("to_state").notNull(),
    policyVersion: text("policy_version").notNull().default("1.0.0"),
    reasonCodes: jsonb("reason_codes").notNull().default([]),
    summary: text("summary").notNull(),
    conditions: jsonb("conditions").notNull().default([]),
    reviewDate: text("review_date"),
    requiredNextEvidence: jsonb("required_next_evidence").notNull().default([]),
    evidenceIds: jsonb("evidence_ids").notNull().default([]),
    actorType: text("actor_type").notNull().default("USER"),
    actorId: text("actor_id").notNull(),
    humanOverride: boolean("human_override").notNull().default(false),
    overrideReason: text("override_reason"),
    parityReportId: text("parity_report_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    committeeDecisionsVersionIdx: index("committee_decisions_version_idx").on(t.strategyVersionId),
  }),
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organisations.id),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id").notNull(),
    action: text("action").notNull(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: text("aggregate_id").notNull(),
    priorStateSummary: jsonb("prior_state_summary"),
    newStateSummary: jsonb("new_state_summary"),
    reason: text("reason"),
    traceId: text("trace_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    auditEventsAggregateIdx: index("audit_events_aggregate_idx").on(t.aggregateType, t.aggregateId),
    auditEventsOrgIdx: index("audit_events_org_idx").on(t.orgId),
    auditEventsCreatedIdx: index("audit_events_created_idx").on(t.createdAt),
  }),
);

export const outboxEvents = pgTable("outbox_events", {
  id: text("id").primaryKey(),
  event: jsonb("event").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  attempts: integer("attempts").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const idempotencyRecords = pgTable(
  "idempotency_records",
  {
    id: text("id").primaryKey(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    responseRef: text("response_ref"),
    actorId: text("actor_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => ({
    idempotencyKeyUnique: unique("idempotency_key_unique").on(t.idempotencyKey),
  }),
);
