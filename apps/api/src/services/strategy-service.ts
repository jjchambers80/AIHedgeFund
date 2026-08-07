/**
 * Strategy service — immutable versioning, SDL, and Pine revision management.
 * Every material change creates a new strategy_versions row — never mutates.
 */
import { uuidv7 } from "uuidv7";
import { eq, and, desc } from "drizzle-orm";
import type { Db } from "@arf-os/db";
import {
  strategies,
  strategyVersions,
  strategyDefinitions,
  pineRevisions,
  strategyLineage,
} from "@arf-os/db";
import { assertOrgAccess } from "@arf-os/auth";
import { hashSource, hashJson } from "@arf-os/pine";
import type {
  CreateStrategyRequest,
  CreateStrategyVersionRequest,
  UploadSDLRequest,
  UploadPineRequest,
} from "@arf-os/contracts";
import { NotFoundError, DomainValidationError } from "../lib/errors.js";
import { writeAuditEvent } from "../lib/audit.js";

function strategyRowToApi(row: typeof strategies.$inferSelect) {
  return {
    id: row.id,
    orgId: row.orgId,
    campaignId: row.campaignId ?? null,
    name: row.name,
    family: row.family,
    status: row.status,
    currentVersionId: row.currentVersionId ?? null,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function versionRowToApi(row: typeof strategyVersions.$inferSelect) {
  return {
    id: row.id,
    strategyId: row.strategyId,
    parentVersionId: row.parentVersionId ?? null,
    versionNumber: row.versionNumber,
    status: row.status,
    lifecycleState: row.lifecycleState,
    definitionId: row.definitionId ?? null,
    pineRevisionId: row.pineRevisionId ?? null,
    definitionHash: row.definitionHash ?? null,
    pineSourceHash: row.pineSourceHash ?? null,
    manifestHash: row.manifestHash ?? null,
    changeReason: row.changeReason ?? null,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ── Strategies ────────────────────────────────────────────────────────────────

export async function listStrategies(db: Db, orgId: string) {
  const rows = await db
    .select()
    .from(strategies)
    .where(eq(strategies.orgId, orgId))
    .orderBy(desc(strategies.createdAt));
  return rows.map(strategyRowToApi);
}

export async function getStrategy(db: Db, orgId: string, id: string) {
  const rows = await db.select().from(strategies).where(eq(strategies.id, id));
  const row = rows[0];
  if (!row) throw new NotFoundError("Strategy", id);
  assertOrgAccess(orgId, row.orgId);
  return strategyRowToApi(row);
}

export async function createStrategy(
  db: Db,
  orgId: string,
  actorId: string,
  data: CreateStrategyRequest,
  traceId?: string,
) {
  const id = uuidv7();

  await db.insert(strategies).values({
    id,
    orgId,
    campaignId: data.campaignId ?? null,
    name: data.name,
    family: data.family,
    status: "DRAFT",
    createdBy: actorId,
  });

  // Create the initial version
  const versionId = uuidv7();
  await db.insert(strategyVersions).values({
    id: versionId,
    strategyId: id,
    versionNumber: 1,
    status: "DRAFT",
    lifecycleState: "CAMPAIGN_BACKLOG",
    createdBy: actorId,
  });

  // Point strategy at current version
  await db
    .update(strategies)
    .set({ currentVersionId: versionId, updatedAt: new Date() })
    .where(eq(strategies.id, id));

  await writeAuditEvent({
    db,
    orgId,
    actorType: "USER",
    actorId,
    action: "strategy.created",
    aggregateType: "strategy",
    aggregateId: id,
    newStateSummary: { name: data.name, family: data.family, versionId },
    traceId,
  });

  const rows = await db.select().from(strategies).where(eq(strategies.id, id));
  return strategyRowToApi(rows[0]!);
}

// ── Versions ──────────────────────────────────────────────────────────────────

export async function listVersions(db: Db, orgId: string, strategyId: string) {
  // Confirm ownership
  await getStrategy(db, orgId, strategyId);

  const rows = await db
    .select()
    .from(strategyVersions)
    .where(eq(strategyVersions.strategyId, strategyId))
    .orderBy(desc(strategyVersions.versionNumber));

  return rows.map(versionRowToApi);
}

export async function getVersion(db: Db, orgId: string, versionId: string) {
  const rows = await db.select().from(strategyVersions).where(eq(strategyVersions.id, versionId));
  const row = rows[0];
  if (!row) throw new NotFoundError("StrategyVersion", versionId);
  // Verify ownership via parent strategy
  await getStrategy(db, orgId, row.strategyId);
  return versionRowToApi(row);
}

export async function createVersion(
  db: Db,
  orgId: string,
  actorId: string,
  strategyId: string,
  data: CreateStrategyVersionRequest,
  traceId?: string,
) {
  const strategy = await getStrategy(db, orgId, strategyId);

  // Compute next version number
  const existing = await db
    .select()
    .from(strategyVersions)
    .where(eq(strategyVersions.strategyId, strategyId))
    .orderBy(desc(strategyVersions.versionNumber))
    .limit(1);

  const nextNumber = (existing[0]?.versionNumber ?? 0) + 1;
  const versionId = uuidv7();

  await db.insert(strategyVersions).values({
    id: versionId,
    strategyId,
    parentVersionId: data.parentVersionId ?? strategy.currentVersionId ?? null,
    versionNumber: nextNumber,
    status: "DRAFT",
    lifecycleState: "CAMPAIGN_BACKLOG",
    changeReason: data.changeReason ?? null,
    createdBy: actorId,
  });

  // Record lineage if we have a parent
  if (data.parentVersionId ?? strategy.currentVersionId) {
    const parentId = data.parentVersionId ?? strategy.currentVersionId!;
    await db.insert(strategyLineage).values({
      id: uuidv7(),
      strategyVersionId: versionId,
      parentVersionId: parentId,
      changeCategory: data.changeReason ? "USER_INITIATED" : "FORK",
      changedFields: [],
      evidenceIds: [],
      contaminatedDatasetIds: [],
    });
  }

  // Update current version pointer
  await db
    .update(strategies)
    .set({ currentVersionId: versionId, updatedAt: new Date() })
    .where(eq(strategies.id, strategyId));

  await writeAuditEvent({
    db,
    orgId,
    actorType: "USER",
    actorId,
    action: "strategy_version.created",
    aggregateType: "strategy_version",
    aggregateId: versionId,
    newStateSummary: {
      versionNumber: nextNumber,
      parentVersionId: data.parentVersionId,
      changeReason: data.changeReason,
    },
    traceId,
  });

  const rows = await db.select().from(strategyVersions).where(eq(strategyVersions.id, versionId));
  return versionRowToApi(rows[0]!);
}

// ── SDL (Strategy Definition) ─────────────────────────────────────────────────

export async function uploadSDL(
  db: Db,
  orgId: string,
  actorId: string,
  versionId: string,
  data: UploadSDLRequest,
  traceId?: string,
) {
  const version = await getVersion(db, orgId, versionId);

  if (version.status !== "DRAFT") {
    throw new DomainValidationError(
      `Cannot upload SDL to a version in status '${version.status}'. Only DRAFT versions accept changes.`,
    );
  }

  const defHash = hashJson(data.definition);

  // Check for existing definition
  if (version.definitionId) {
    // Idempotent: same hash = noop
    if (version.definitionHash === defHash) return version;
    throw new DomainValidationError(
      "Strategy version already has an SDL. Create a new version to make changes.",
    );
  }

  const defId = uuidv7();
  await db.insert(strategyDefinitions).values({
    id: defId,
    strategyVersionId: versionId,
    schemaVersion: "1.0.0",
    definition: data.definition,
    definitionHash: defHash,
    createdBy: actorId,
  });

  await db
    .update(strategyVersions)
    .set({
      definitionId: defId,
      definitionHash: defHash,
      updatedAt: new Date(),
    })
    .where(eq(strategyVersions.id, versionId));

  await writeAuditEvent({
    db,
    orgId,
    actorType: "USER",
    actorId,
    action: "strategy_version.sdl_uploaded",
    aggregateType: "strategy_version",
    aggregateId: versionId,
    newStateSummary: { definitionId: defId, definitionHash: defHash },
    traceId,
  });

  const rows = await db.select().from(strategyVersions).where(eq(strategyVersions.id, versionId));
  return versionRowToApi(rows[0]!);
}

// ── Pine revisions ────────────────────────────────────────────────────────────

export async function uploadPine(
  db: Db,
  orgId: string,
  actorId: string,
  versionId: string,
  data: UploadPineRequest,
  traceId?: string,
) {
  const version = await getVersion(db, orgId, versionId);

  if (version.status !== "DRAFT") {
    throw new DomainValidationError(
      `Cannot upload Pine source to a version in status '${version.status}'. Only DRAFT versions accept changes.`,
    );
  }

  const sourceHash = hashSource(data.source);
  const manifestHash = hashJson(data.manifest);

  if (version.pineRevisionId) {
    if (version.pineSourceHash === sourceHash && version.manifestHash === manifestHash) {
      return version;
    }
    throw new DomainValidationError(
      "Strategy version already has a Pine revision. Create a new version to make changes.",
    );
  }

  const revisionId = uuidv7();
  await db.insert(pineRevisions).values({
    id: revisionId,
    strategyVersionId: versionId,
    sourceHash,
    manifestHash,
    source: data.source,
    manifest: data.manifest,
    pineVersion: "6",
    compileStatus: "PENDING",
    staticChecksPassed: null,
    staticWarnings: [],
    staticErrors: [],
    createdBy: actorId,
  });

  await db
    .update(strategyVersions)
    .set({
      pineRevisionId: revisionId,
      pineSourceHash: sourceHash,
      manifestHash,
      updatedAt: new Date(),
    })
    .where(eq(strategyVersions.id, versionId));

  await writeAuditEvent({
    db,
    orgId,
    actorType: "USER",
    actorId,
    action: "strategy_version.pine_uploaded",
    aggregateType: "strategy_version",
    aggregateId: versionId,
    newStateSummary: { revisionId, sourceHash, manifestHash },
    traceId,
  });

  const rows = await db.select().from(strategyVersions).where(eq(strategyVersions.id, versionId));
  return versionRowToApi(rows[0]!);
}

export async function getPineRevision(db: Db, orgId: string, versionId: string) {
  const version = await getVersion(db, orgId, versionId);

  if (!version.pineRevisionId) throw new NotFoundError("PineRevision", versionId);

  const rows = await db
    .select()
    .from(pineRevisions)
    .where(eq(pineRevisions.id, version.pineRevisionId));

  const row = rows[0];
  if (!row) throw new NotFoundError("PineRevision", version.pineRevisionId);

  return {
    id: row.id,
    strategyVersionId: row.strategyVersionId,
    sourceHash: row.sourceHash,
    manifestHash: row.manifestHash,
    source: row.source,
    manifest: row.manifest as Record<string, unknown>,
    pineVersion: row.pineVersion,
    compileStatus: row.compileStatus,
    staticChecksPassed: row.staticChecksPassed ?? null,
    staticWarnings: (row.staticWarnings as unknown[]) ?? [],
    staticErrors: (row.staticErrors as unknown[]) ?? [],
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

// Re-export request types for use by route handlers
export type { UploadSDLRequest, UploadPineRequest };
