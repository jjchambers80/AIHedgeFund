/**
 * Verification service — manages TradingView verifications, presigned uploads,
 * and post-upload metric/parity computation.
 */
import { uuidv7 } from "uuidv7";
import { eq, and } from "drizzle-orm";
import type { Db } from "@arf-os/db";
import {
  tradingViewVerifications,
  reportUploads,
  backtestRuns,
  trades as tradesTable,
  equityPoints,
  drawdownPoints,
  parityReports,
  metricSnapshots,
  createPresignedUploadUrl,
  buildObjectKey,
} from "@arf-os/db";
import { assertOrgAccess } from "@arf-os/auth";
import type {
  CreateVerificationRequest,
  CompleteUploadRequest,
} from "@arf-os/contracts";
import { NotFoundError, DomainValidationError, ConflictError } from "../lib/errors.js";
import { writeAuditEvent } from "../lib/audit.js";
import { getVersion } from "./strategy-service.js";
import { enqueueParseReportJob } from "../lib/queue.js";

function verifRowToApi(row: typeof tradingViewVerifications.$inferSelect) {
  return {
    id: row.id,
    orgId: row.orgId,
    strategyVersionId: row.strategyVersionId,
    pineRevisionId: row.pineRevisionId,
    symbol: row.symbol,
    timeframe: row.timeframe,
    dateFrom: row.dateFrom ?? null,
    dateTo: row.dateTo ?? null,
    status: row.status,
    parityReportId: row.parityReportId ?? null,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ── Verifications ─────────────────────────────────────────────────────────────

export async function createVerification(
  db: Db,
  orgId: string,
  actorId: string,
  data: CreateVerificationRequest,
  traceId?: string,
) {
  // Verify the strategy version belongs to this org
  const version = await getVersion(db, orgId, data.strategyVersionId);

  if (!version.pineRevisionId) {
    throw new DomainValidationError(
      "Strategy version has no Pine revision. Upload Pine source before creating a verification.",
    );
  }

  const id = uuidv7();
  await db.insert(tradingViewVerifications).values({
    id,
    orgId,
    strategyVersionId: data.strategyVersionId,
    pineRevisionId: data.pineRevisionId,
    symbol: data.symbol,
    timeframe: data.timeframe,
    dateFrom: data.dateFrom ?? null,
    dateTo: data.dateTo ?? null,
    status: "PENDING",
    createdBy: actorId,
  });

  await writeAuditEvent({
    db,
    orgId,
    actorType: "USER",
    actorId,
    action: "verification.created",
    aggregateType: "tradingview_verification",
    aggregateId: id,
    newStateSummary: {
      strategyVersionId: data.strategyVersionId,
      symbol: data.symbol,
      timeframe: data.timeframe,
    },
    traceId,
  });

  const rows = await db
    .select()
    .from(tradingViewVerifications)
    .where(eq(tradingViewVerifications.id, id));
  return verifRowToApi(rows[0]!);
}

export async function getVerification(db: Db, orgId: string, id: string) {
  const rows = await db
    .select()
    .from(tradingViewVerifications)
    .where(eq(tradingViewVerifications.id, id));
  const row = rows[0];
  if (!row) throw new NotFoundError("TradingViewVerification", id);
  assertOrgAccess(orgId, row.orgId);
  return verifRowToApi(row);
}

// ── Presigned upload ──────────────────────────────────────────────────────────

export async function presignUpload(
  db: Db,
  orgId: string,
  actorId: string,
  verificationId: string,
  reportType: "PERFORMANCE_SUMMARY" | "LIST_OF_TRADES",
  traceId?: string,
) {
  const verif = await getVerification(db, orgId, verificationId);

  // One upload per report type per verification
  const existing = await db
    .select()
    .from(reportUploads)
    .where(
      and(
        eq(reportUploads.verificationId, verificationId),
        eq(reportUploads.reportType, reportType),
      ),
    );

  if (existing.length > 0) {
    throw new ConflictError(
      `A ${reportType} upload already exists for this verification. Use the existing upload or create a new verification.`,
    );
  }

  const uploadId = uuidv7();
  const objectKey = buildObjectKey({
    orgId,
    strategyId: verif.strategyVersionId,
    versionId: verificationId,
    subPath: `tv-reports/${reportType.toLowerCase()}-${uploadId}.csv`,
  });

  const presignedUrl = await createPresignedUploadUrl(objectKey, "text/csv", 900);
  const expiresAt = new Date(Date.now() + 900_000).toISOString();

  // We'll store the upload record as a placeholder — completed on the client's callback
  await db.insert(reportUploads).values({
    id: uploadId,
    verificationId,
    reportType,
    objectKey,
    checksumSha256: "pending",
    fileSizeBytes: 0,
    parseStatus: "AWAITING_UPLOAD",
  });

  await writeAuditEvent({
    db,
    orgId,
    actorType: "USER",
    actorId,
    action: "report_upload.presigned",
    aggregateType: "report_upload",
    aggregateId: uploadId,
    newStateSummary: { verificationId, reportType, objectKey },
    traceId,
  });

  return {
    uploadId,
    presignedUrl,
    objectKey,
    expiresAt,
  };
}

// ── Complete upload + parse ───────────────────────────────────────────────────

export async function completeUpload(
  db: Db,
  orgId: string,
  actorId: string,
  verificationId: string,
  uploadId: string,
  data: CompleteUploadRequest,
  traceId?: string,
) {
  await getVerification(db, orgId, verificationId);

  const uploadRows = await db
    .select()
    .from(reportUploads)
    .where(
      and(
        eq(reportUploads.id, uploadId),
        eq(reportUploads.verificationId, verificationId),
      ),
    );

  const upload = uploadRows[0];
  if (!upload) throw new NotFoundError("ReportUpload", uploadId);

  if (upload.parseStatus !== "AWAITING_UPLOAD") {
    if (upload.parseStatus === "COMPLETE") {
      // Idempotent — return success
      return { uploadId, parseStatus: upload.parseStatus };
    }
    throw new ConflictError(`Upload is in status '${upload.parseStatus}', cannot complete.`);
  }

  // Update with confirmed metadata
  await db
    .update(reportUploads)
    .set({
      checksumSha256: data.checksumSha256,
      fileSizeBytes: data.fileSizeBytes,
      parseStatus: "QUEUED",
      updatedAt: new Date(),
    })
    .where(eq(reportUploads.id, uploadId));

  await writeAuditEvent({
    db,
    orgId,
    actorType: "USER",
    actorId,
    action: "report_upload.completed",
    aggregateType: "report_upload",
    aggregateId: uploadId,
    newStateSummary: {
      checksumSha256: data.checksumSha256,
      fileSizeBytes: data.fileSizeBytes,
      reportType: data.reportType,
    },
    traceId,
  });

  // Real parsing happens in worker-backtest's parse-report job (CLAUDE.md §3.2:
  // the API enqueues work, it does not execute it). The job is idempotent and
  // keyed by uploadId, so a retried completeUpload call is safe to re-enqueue.
  await enqueueParseReportJob({
    uploadId,
    verificationId,
    objectKey: upload.objectKey,
    reportType: data.reportType,
    orgId,
  });

  return { uploadId, parseStatus: "QUEUED" };
}

// ── Uploads ────────────────────────────────────────────────────────────────────

export async function listUploads(db: Db, orgId: string, verificationId: string) {
  await getVerification(db, orgId, verificationId);

  const rows = await db
    .select()
    .from(reportUploads)
    .where(eq(reportUploads.verificationId, verificationId));

  return rows.map((u) => ({
    id: u.id,
    verificationId: u.verificationId,
    reportType: u.reportType,
    objectKey: u.objectKey,
    checksumSha256: u.checksumSha256,
    fileSizeBytes: u.fileSizeBytes,
    parseStatus: u.parseStatus,
    parseWarnings: (u.parseWarnings as Array<{ code: string; message: string }>) ?? [],
    parserVersion: u.parserVersion ?? null,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  }));
}

// ── Query helpers used by routes ──────────────────────────────────────────────

export async function getBacktestMetrics(db: Db, orgId: string, versionId: string) {
  // Verify ownership
  await getVersion(db, orgId, versionId);

  const runRows = await db
    .select()
    .from(backtestRuns)
    .where(eq(backtestRuns.strategyVersionId, versionId))
    .orderBy(backtestRuns.createdAt)
    .limit(1);

  const run = runRows[0];
  if (!run) return null;

  const snapshots = await db
    .select()
    .from(metricSnapshots)
    .where(
      and(
        eq(metricSnapshots.scopeType, "backtest_run"),
        eq(metricSnapshots.scopeId, run.id),
      ),
    );

  return { backtestRunId: run.id, snapshots: snapshots.map((s) => ({
    id: s.id,
    name: s.metricName,
    value: s.value,
    unit: s.unit,
    calculationVersion: s.calculationVersion,
    scopeType: s.scopeType,
    scopeId: s.scopeId,
    computedAt: s.computedAt.toISOString(),
  })) };
}

export async function getEquityCurve(db: Db, orgId: string, versionId: string) {
  await getVersion(db, orgId, versionId);

  const runRows = await db
    .select()
    .from(backtestRuns)
    .where(eq(backtestRuns.strategyVersionId, versionId))
    .orderBy(backtestRuns.createdAt)
    .limit(1);

  const run = runRows[0];
  if (!run) return null;

  const points = await db
    .select()
    .from(equityPoints)
    .where(eq(equityPoints.backtestRunId, run.id))
    .orderBy(equityPoints.tradeNumber);

  return { backtestRunId: run.id, points: points.map((p) => ({
    tradeNumber: p.tradeNumber,
    timestamp: p.timestamp.toISOString(),
    equity: p.equity,
  })) };
}

export async function getDrawdownCurve(db: Db, orgId: string, versionId: string) {
  await getVersion(db, orgId, versionId);

  const runRows = await db
    .select()
    .from(backtestRuns)
    .where(eq(backtestRuns.strategyVersionId, versionId))
    .orderBy(backtestRuns.createdAt)
    .limit(1);

  const run = runRows[0];
  if (!run) return null;

  const points = await db
    .select()
    .from(drawdownPoints)
    .where(eq(drawdownPoints.backtestRunId, run.id))
    .orderBy(drawdownPoints.tradeNumber);

  return { backtestRunId: run.id, points: points.map((p) => ({
    tradeNumber: p.tradeNumber,
    timestamp: p.timestamp.toISOString(),
    drawdownAbs: p.drawdownAbs,
    drawdownPct: p.drawdownPct,
  })) };
}

export async function getParityReport(db: Db, orgId: string, versionId: string) {
  await getVersion(db, orgId, versionId);

  const verifRows = await db
    .select()
    .from(tradingViewVerifications)
    .where(eq(tradingViewVerifications.strategyVersionId, versionId))
    .orderBy(tradingViewVerifications.createdAt)
    .limit(1);

  const verif = verifRows[0];
  if (!verif?.parityReportId) return null;

  const reportRows = await db
    .select()
    .from(parityReports)
    .where(eq(parityReports.id, verif.parityReportId));

  const r = reportRows[0];
  if (!r) return null;

  return {
    id: r.id,
    verificationId: r.verificationId,
    backtestRunId: r.backtestRunId,
    status: r.status,
    tvTradeCount: r.tvTradeCount ?? null,
    arfTradeCount: r.arfTradeCount ?? null,
    tvNetProfit: r.tvNetProfit ?? null,
    arfNetProfit: r.arfNetProfit ?? null,
    tvMaxDrawdown: r.tvMaxDrawdown ?? null,
    arfMaxDrawdown: r.arfMaxDrawdown ?? null,
    firstTradeDivergence: r.firstTradeDivergence ?? null,
    warnings: (r.warnings as string[]) ?? [],
    policyVersion: r.policyVersion,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function getTrades(db: Db, orgId: string, versionId: string, cursor?: string, limit = 100) {
  await getVersion(db, orgId, versionId);

  const runRows = await db
    .select()
    .from(backtestRuns)
    .where(eq(backtestRuns.strategyVersionId, versionId))
    .orderBy(backtestRuns.createdAt)
    .limit(1);

  const run = runRows[0];
  if (!run) return { backtestRunId: null, items: [], nextCursor: null };

  const take = Math.min(limit, 500);
  const rows = await db
    .select()
    .from(tradesTable)
    .where(eq(tradesTable.backtestRunId, run.id))
    .orderBy(tradesTable.tradeNumber)
    .limit(take + 1)
    .offset(cursor ? parseInt(cursor, 10) : 0);

  const hasNext = rows.length > take;
  const items = rows.slice(0, take).map((t) => ({
    id: t.id,
    tradeNumber: t.tradeNumber,
    direction: t.direction,
    entryTime: t.entryTime.toISOString(),
    exitTime: t.exitTime.toISOString(),
    entryPrice: t.entryPrice,
    exitPrice: t.exitPrice,
    quantity: t.quantity,
    grossPnl: t.grossPnl,
    commission: t.commission,
    netPnl: t.netPnl,
    entryReason: t.entryReason ?? null,
    exitReason: t.exitReason ?? null,
    parityStatus: t.parityStatus,
  }));

  const offset = cursor ? parseInt(cursor, 10) : 0;
  return {
    backtestRunId: run.id,
    items,
    nextCursor: hasNext ? String(offset + take) : null,
  };
}
