import { z } from "zod";
import { DecisionValueSchema, ResearchStateSchema, AuditActorTypeSchema } from "./enums.js";

// ── Committee Decision ────────────────────────────────────────────────────────

export const CommitteeDecisionSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  strategyVersionId: z.string(),
  decision: DecisionValueSchema,
  fromState: ResearchStateSchema,
  toState: ResearchStateSchema,
  policyVersion: z.string(),
  reasonCodes: z.array(z.string()),
  summary: z.string(),
  conditions: z.array(z.string()),
  reviewDate: z.string().date().nullable(),
  requiredNextEvidence: z.array(z.string()),
  evidenceIds: z.array(z.string()),
  actorType: AuditActorTypeSchema,
  actorId: z.string(),
  humanOverride: z.boolean().default(false),
  overrideReason: z.string().nullable(),
  parityReportId: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type CommitteeDecision = z.infer<typeof CommitteeDecisionSchema>;

export const CreateDecisionSchema = CommitteeDecisionSchema.omit({
  id: true,
  createdAt: true,
});
export type CreateDecision = z.infer<typeof CreateDecisionSchema>;

// ── Audit Event ───────────────────────────────────────────────────────────────

export const AuditEventSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  actorType: AuditActorTypeSchema,
  actorId: z.string(),
  action: z.string(),       // e.g. "strategy_version.created"
  aggregateType: z.string(),
  aggregateId: z.string(),
  priorStateSummary: z.record(z.unknown()).nullable(),
  newStateSummary: z.record(z.unknown()).nullable(),
  reason: z.string().nullable(),
  traceId: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;
