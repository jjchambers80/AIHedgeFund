/**
 * Campaign service — all DB interactions for campaigns and research tasks.
 * Route handlers call this; no SQL in route files.
 */
import { uuidv7 } from "uuidv7";
import { eq, and, desc, gt } from "drizzle-orm";
import type { Db } from "@arf-os/db";
import { campaigns, researchTasks } from "@arf-os/db";
import { assertOrgAccess } from "@arf-os/auth";
import type { CreateCampaignRequest } from "@arf-os/contracts";
import { NotFoundError } from "../lib/errors.js";
import { writeAuditEvent } from "../lib/audit.js";

export interface ListCampaignsInput {
  db: Db;
  orgId: string;
  actorId: string;
  cursor?: string | null;
  limit?: number;
}

export interface CreateCampaignInput {
  db: Db;
  orgId: string;
  actorId: string;
  data: CreateCampaignRequest;
  traceId?: string;
}

function rowToApi(row: typeof campaigns.$inferSelect) {
  return {
    id: row.id,
    orgId: row.orgId,
    title: row.title,
    objective: row.objective,
    markets: (row.markets as string[]) ?? [],
    symbols: (row.symbols as string[]) ?? [],
    timeframes: (row.timeframes as string[]) ?? [],
    strategyFamilies: (row.strategyFamilies as string[]) ?? [],
    constraints: (row.constraints as string[]) ?? [],
    status: row.status,
    modelBudgetUsd: row.modelBudgetUsd ?? null,
    computeRunsLimit: row.computeRunsLimit ?? null,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listCampaigns(input: ListCampaignsInput) {
  const { db, orgId, cursor, limit = 25 } = input;
  const take = Math.min(limit, 100);

  const rows = await db
    .select()
    .from(campaigns)
    .where(
      cursor
        ? and(eq(campaigns.orgId, orgId), gt(campaigns.id, cursor))
        : eq(campaigns.orgId, orgId),
    )
    .orderBy(desc(campaigns.createdAt))
    .limit(take + 1);

  const hasNext = rows.length > take;
  const items = rows.slice(0, take).map(rowToApi);
  return {
    items,
    nextCursor: hasNext ? (items[items.length - 1]?.id ?? null) : null,
  };
}

export async function getCampaign(db: Db, orgId: string, id: string) {
  const rows = await db.select().from(campaigns).where(eq(campaigns.id, id));
  const row = rows[0];
  if (!row) throw new NotFoundError("Campaign", id);
  assertOrgAccess(orgId, row.orgId);
  return rowToApi(row);
}

export async function createCampaign(input: CreateCampaignInput) {
  const { db, orgId, actorId, data, traceId } = input;
  const id = uuidv7();

  await db.insert(campaigns).values({
    id,
    orgId,
    title: data.title,
    objective: data.objective,
    markets: data.markets,
    symbols: data.symbols,
    timeframes: data.timeframes,
    strategyFamilies: data.strategyFamilies,
    constraints: data.constraints,
    status: "CAMPAIGN_BACKLOG",
    modelBudgetUsd: data.modelBudgetUsd ?? null,
    computeRunsLimit: data.computeRunsLimit ?? null,
    createdBy: actorId,
  });

  await writeAuditEvent({
    db,
    orgId,
    actorType: "USER",
    actorId,
    action: "campaign.created",
    aggregateType: "campaign",
    aggregateId: id,
    newStateSummary: { title: data.title, status: "CAMPAIGN_BACKLOG" },
    traceId,
  });

  const rows = await db.select().from(campaigns).where(eq(campaigns.id, id));
  return rowToApi(rows[0]!);
}

export async function listResearchTasks(db: Db, orgId: string, campaignId: string) {
  // Verify the campaign belongs to this org first
  await getCampaign(db, orgId, campaignId);

  const rows = await db
    .select()
    .from(researchTasks)
    .where(eq(researchTasks.campaignId, campaignId))
    .orderBy(desc(researchTasks.createdAt));

  return rows.map((row) => ({
    id: row.id,
    campaignId: row.campaignId,
    strategyId: row.strategyId ?? null,
    strategyVersionId: row.strategyVersionId ?? null,
    title: row.title,
    description: row.description,
    state: row.state,
    assignedRole: row.assignedRole ?? null,
    blockedReason: row.blockedReason ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}
