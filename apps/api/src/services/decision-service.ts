/**
 * Committee decision service.
 * Validates workflow transition, records decision, writes audit event.
 */
import { uuidv7 } from "uuidv7";
import { eq } from "drizzle-orm";
import type { Db } from "@arf-os/db";
import { committeeDecisions, strategyVersions } from "@arf-os/db";
import { transition } from "@arf-os/workflow";
import type { Role, ResearchState } from "@arf-os/contracts";
import type { CreateDecisionRequest } from "@arf-os/contracts";
import { NotFoundError, DomainValidationError } from "../lib/errors.js";
import { writeAuditEvent } from "../lib/audit.js";
import { getVersion } from "./strategy-service.js";

/** Maps decision value to the resulting lifecycle state. */
function decisionToTargetState(
  decision: CreateDecisionRequest["decision"],
): ResearchState {
  switch (decision) {
    case "REJECT":
      return "REJECTED";
    case "REWORK_WITH_NEW_VERSION":
      return "HYPOTHESIS_DRAFT"; // send back for rework/refinement
    case "PAPER_APPROVED":
      return "LIVE_CANDIDATE";
    case "RESEARCH_APPROVED":
      return "RESEARCH_APPROVED";
    case "INSUFFICIENT_EVIDENCE":
      return "TRADINGVIEW_VERIFICATION"; // keep at verification stage
  }
}

export async function createDecision(
  db: Db,
  orgId: string,
  actorId: string,
  actorRole: string,
  data: CreateDecisionRequest,
  traceId?: string,
) {
  const version = await getVersion(db, orgId, data.strategyVersionId);
  const fromState = version.lifecycleState as ResearchState;
  const toState = decisionToTargetState(data.decision);

  // Run the workflow machine — this is the authority
  const result = transition({
    from: fromState,
    to: toState,
    actorRole: actorRole as Role,
    actorId,
    evidenceTypes: data.reasonCodes,
    humanApproved: data.humanOverride,
    reason: data.summary,
  });

  if (!result.ok) {
    throw new DomainValidationError(
      `Workflow transition denied: ${result.message}`,
      { code: result.code },
    );
  }

  const decisionId = uuidv7();
  await db.insert(committeeDecisions).values({
    id: decisionId,
    orgId,
    strategyVersionId: data.strategyVersionId,
    decision: data.decision,
    fromState,
    toState,
    policyVersion: "1.0.0",
    reasonCodes: data.reasonCodes,
    summary: data.summary,
    conditions: data.conditions,
    reviewDate: data.reviewDate ?? null,
    requiredNextEvidence: [],
    evidenceIds: [],
    actorType: "USER",
    actorId,
    humanOverride: data.humanOverride,
    overrideReason: data.overrideReason ?? null,
  });

  // Apply the state transition to the version
  await db
    .update(strategyVersions)
    .set({
      lifecycleState: toState,
      updatedAt: new Date(),
    })
    .where(eq(strategyVersions.id, data.strategyVersionId));

  await writeAuditEvent({
    db,
    orgId,
    actorType: "USER",
    actorId,
    action: "committee_decision.created",
    aggregateType: "strategy_version",
    aggregateId: data.strategyVersionId,
    priorStateSummary: { lifecycleState: fromState },
    newStateSummary: { lifecycleState: toState, decision: data.decision, decisionId },
    reason: data.summary,
    traceId,
  });

  const rows = await db
    .select()
    .from(committeeDecisions)
    .where(eq(committeeDecisions.id, decisionId));
  const d = rows[0]!;

  return {
    id: d.id,
    orgId: d.orgId,
    strategyVersionId: d.strategyVersionId,
    decision: d.decision,
    fromState: d.fromState,
    toState: d.toState,
    policyVersion: d.policyVersion,
    reasonCodes: (d.reasonCodes as string[]) ?? [],
    summary: d.summary,
    conditions: (d.conditions as string[]) ?? [],
    reviewDate: d.reviewDate ?? null,
    actorType: d.actorType,
    actorId: d.actorId,
    humanOverride: d.humanOverride,
    overrideReason: d.overrideReason ?? null,
    createdAt: d.createdAt.toISOString(),
  };
}

export async function listDecisions(db: Db, orgId: string, strategyVersionId: string) {
  // Validate ownership
  await getVersion(db, orgId, strategyVersionId);

  const rows = await db
    .select()
    .from(committeeDecisions)
    .where(eq(committeeDecisions.strategyVersionId, strategyVersionId))
    .orderBy(committeeDecisions.createdAt);

  return rows.map((d) => ({
    id: d.id,
    orgId: d.orgId,
    strategyVersionId: d.strategyVersionId,
    decision: d.decision,
    fromState: d.fromState,
    toState: d.toState,
    policyVersion: d.policyVersion,
    reasonCodes: (d.reasonCodes as string[]) ?? [],
    summary: d.summary,
    conditions: (d.conditions as string[]) ?? [],
    reviewDate: d.reviewDate ?? null,
    actorType: d.actorType,
    actorId: d.actorId,
    humanOverride: d.humanOverride,
    overrideReason: d.overrideReason ?? null,
    createdAt: d.createdAt.toISOString(),
  }));
}
