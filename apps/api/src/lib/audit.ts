/**
 * Append-only audit event writer.
 * Every write here goes to the audit_events table — never mutates existing rows.
 */
import { uuidv7 } from "uuidv7";
import type { Db } from "@arf-os/db";
import { auditEvents } from "@arf-os/db";

export interface AuditParams {
  db: Db;
  orgId: string;
  actorType: "USER" | "AGENT" | "SYSTEM";
  actorId: string;
  action: string;
  aggregateType: string;
  aggregateId: string;
  priorStateSummary?: Record<string, unknown> | null;
  newStateSummary?: Record<string, unknown> | null;
  reason?: string | null;
  traceId?: string | null;
}

export async function writeAuditEvent(params: AuditParams): Promise<void> {
  await params.db.insert(auditEvents).values({
    id: uuidv7(),
    orgId: params.orgId,
    actorType: params.actorType,
    actorId: params.actorId,
    action: params.action,
    aggregateType: params.aggregateType,
    aggregateId: params.aggregateId,
    priorStateSummary: params.priorStateSummary ?? null,
    newStateSummary: params.newStateSummary ?? null,
    reason: params.reason ?? null,
    traceId: params.traceId ?? null,
  });
}
