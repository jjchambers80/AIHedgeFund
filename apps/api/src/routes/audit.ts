import type { FastifyInstance } from "fastify";
import { eq, and, desc, gt } from "drizzle-orm";
import { getDb, auditEvents } from "@arf-os/db";
import { DomainValidationError } from "../lib/errors.js";

export async function registerAuditRoutes(server: FastifyInstance) {
  const db = getDb();

  /**
   * GET /api/v1/audit
   * Query params:
   *   aggregateType — required (e.g. "strategy_version", "campaign")
   *   aggregateId   — required
   *   cursor        — optional, pagination cursor (id)
   *   limit         — optional, default 50
   */
  server.get("/audit", async (request) => {
    const q = request.query as {
      aggregateType?: string;
      aggregateId?: string;
      cursor?: string;
      limit?: string;
    };

    if (!q.aggregateType || !q.aggregateId) {
      throw new DomainValidationError("aggregateType and aggregateId are required");
    }

    const orgId = request.auth.orgId;
    const take = Math.min(q.limit ? parseInt(q.limit, 10) : 50, 200);

    const rows = await db
      .select()
      .from(auditEvents)
      .where(
        q.cursor
          ? and(
              eq(auditEvents.orgId, orgId),
              eq(auditEvents.aggregateType, q.aggregateType),
              eq(auditEvents.aggregateId, q.aggregateId),
              gt(auditEvents.id, q.cursor),
            )
          : and(
              eq(auditEvents.orgId, orgId),
              eq(auditEvents.aggregateType, q.aggregateType),
              eq(auditEvents.aggregateId, q.aggregateId),
            ),
      )
      .orderBy(desc(auditEvents.createdAt))
      .limit(take + 1);

    const hasNext = rows.length > take;
    const items = rows.slice(0, take).map((r) => ({
      id: r.id,
      orgId: r.orgId,
      actorType: r.actorType,
      actorId: r.actorId,
      action: r.action,
      aggregateType: r.aggregateType,
      aggregateId: r.aggregateId,
      priorStateSummary: r.priorStateSummary as Record<string, unknown> | null,
      newStateSummary: r.newStateSummary as Record<string, unknown> | null,
      reason: r.reason ?? null,
      traceId: r.traceId ?? null,
      createdAt: r.createdAt.toISOString(),
    }));

    return {
      items,
      nextCursor: hasNext ? (items[items.length - 1]?.id ?? null) : null,
    };
  });
}
