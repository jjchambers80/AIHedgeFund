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
  getObject,
} from "@arf-os/db";
import { assertOrgAccess } from "@arf-os/auth";
import { parseTradesCSV, parseSummaryCSV } from "@arf-os/pine";
import {
  computeTradeMetrics,
  CALCULATION_VERSION,
  reconstructEquity,
  computeDrawdown,
  computeParityReport,
} from "@arf-os/metrics";
import type {
  CreateVerificationRequest,
  CompleteUploadRequest,
} from "@arf-os/contracts";
import { NotFoundError, DomainValidationError, ConflictError } from "../lib/errors.js";
import { writeAuditEvent } from "../lib/audit.js";
import { getVersion } from "./strategy-service.js";

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

  // Inline parsing: in production this would be a BullMQ job,
  // but for the MVP vertical slice we parse synchronously after upload.
  await parseAndStoreReport(db, orgId, actorId, verificationId, uploadId, upload.objectKey, data.reportType, traceId);

  return { uploadId, parseStatus: "COMPLETE" };
}

async function parseAndStoreReport(
  db: Db,
  orgId: string,
  actorId: string,
  verificationId: string,
  uploadId: string,
  objectKey: string,
  reportType: "PERFORMANCE_SUMMARY" | "LIST_OF_TRADES",
  traceId?: string,
) {
  const csvBuffer = await getObject(objectKey);
  const csvText = csvBuffer.toString("utf-8");

  await db
    .update(reportUploads)
    .set({ parseStatus: "PARSING", updatedAt: new Date() })
    .where(eq(reportUploads.id, uploadId));

  if (reportType === "LIST_OF_TRADES") {
    const result = parseTradesCSV(csvText);

    await db
      .update(reportUploads)
      .set({
        parseStatus: result.trades.length > 0 ? "COMPLETE" : "FAILED",
        parseWarnings: result.warnings.map((w) => ({ code: w.code, message: w.message })),
        parserVersion: "1.0.0",
        updatedAt: new Date(),
      })
      .where(eq(reportUploads.id, uploadId));

    if (result.trades.length > 0) {
      await storeTradesAndMetrics(db, orgId, actorId, verificationId, uploadId, result, traceId);
    }
  } else {
    // PERFORMANCE_SUMMARY — store for parity comparison only
    const result = parseSummaryCSV(csvText);

    await db
      .update(reportUploads)
      .set({
        parseStatus: "COMPLETE",
        parserVersion: "1.0.0",
        updatedAt: new Date(),
      })
      .where(eq(reportUploads.id, uploadId));

    // Trigger parity check if trades are already stored
    await tryComputeParity(db, orgId, verificationId, result.summary, traceId);
  }
}

async function storeTradesAndMetrics(
  db: Db,
  orgId: string,
  actorId: string,
  verificationId: string,
  _uploadId: string,
  tradeResult: { trades: ReturnType<typeof parseTradesCSV>["trades"] },
  traceId?: string,
) {
  const verif = await db
    .select()
    .from(tradingViewVerifications)
    .where(eq(tradingViewVerifications.id, verificationId));
  const v = verif[0]!;

  // Create a backtest run record
  const runId = uuidv7();
  await db.insert(backtestRuns).values({
    id: runId,
    strategyVersionId: v.strategyVersionId,
    verificationId,
    runnerType: "TRADINGVIEW_CSV",
    runnerVersion: "1.0.0",
    symbol: v.symbol,
    timeframe: v.timeframe,
    dateFrom: v.dateFrom ?? null,
    dateTo: v.dateTo ?? null,
    initialCapital: "100000",
    currency: "USD",
    status: "COMPLETE",
    tradeCount: tradeResult.trades.length,
    sourceHash: null,
    startedAt: new Date(),
    completedAt: new Date(),
  });

  // Store individual trades
  const parsedTrades = tradeResult.trades;
  for (const t of parsedTrades) {
    await db.insert(tradesTable).values({
      id: uuidv7(),
      backtestRunId: runId,
      tradeNumber: t.tradeNumber,
      direction: t.direction,
      entryTime: new Date(t.entryTime),
      exitTime: new Date(t.exitTime),
      entryPrice: t.entryPrice,
      exitPrice: t.exitPrice,
      quantity: t.quantity,
      grossPnl: t.grossPnl,
      commission: t.commission,
      netPnl: t.netPnl,
      entryReason: t.entryReason ?? null,
      exitReason: t.exitReason ?? null,
      parityStatus: "UNVERIFIED",
    });
  }

  // Compute and store metrics
  const metrics = computeTradeMetrics(parsedTrades);
  const equityPointsList = reconstructEquity(parsedTrades, "100000");
  const { points: ddPoints, maxDrawdownAbs, maxDrawdownPct } = computeDrawdown(equityPointsList);

  // Equity points
  for (const ep of equityPointsList) {
    await db.insert(equityPoints).values({
      id: uuidv7(),
      backtestRunId: runId,
      tradeNumber: ep.tradeNumber,
      timestamp: new Date(ep.timestamp),
      equity: ep.equity,
    });
  }

  // Drawdown points
  for (const dp of ddPoints) {
    await db.insert(drawdownPoints).values({
      id: uuidv7(),
      backtestRunId: runId,
      tradeNumber: dp.tradeNumber,
      timestamp: new Date(dp.timestamp),
      drawdownAbs: dp.drawdownAbs,
      drawdownPct: dp.drawdownPct,
    });
  }

  // Metric snapshots
  const metricEntries: Array<{ name: string; value: string; unit: string }> = [
    { name: "trade_count", value: String(metrics.tradeCount), unit: "count" },
    { name: "gross_profit", value: metrics.grossProfit, unit: "currency" },
    { name: "gross_loss", value: metrics.grossLoss, unit: "currency" },
    { name: "net_profit", value: metrics.netProfit, unit: "currency" },
    { name: "profit_factor", value: metrics.profitFactor, unit: "ratio" },
    { name: "win_rate", value: metrics.winRate, unit: "fraction" },
    { name: "avg_win", value: metrics.avgWin, unit: "currency" },
    { name: "avg_loss", value: metrics.avgLoss, unit: "currency" },
    { name: "payoff_ratio", value: metrics.payoffRatio, unit: "ratio" },
    { name: "max_drawdown_abs", value: maxDrawdownAbs, unit: "currency" },
    { name: "max_drawdown_pct", value: maxDrawdownPct, unit: "fraction" },
    { name: "longest_losing_streak", value: String(metrics.longestLosingStreak), unit: "count" },
    { name: "total_commission", value: metrics.totalCommission, unit: "currency" },
  ];
  if (metrics.avgHoldingDurationHours !== null) {
    metricEntries.push({ name: "avg_holding_hours", value: metrics.avgHoldingDurationHours, unit: "hours" });
  }

  for (const m of metricEntries) {
    await db.insert(metricSnapshots).values({
      id: uuidv7(),
      metricName: m.name,
      value: m.value,
      unit: m.unit,
      calculationVersion: CALCULATION_VERSION,
      scopeType: "backtest_run",
      scopeId: runId,
    });
  }

  // Update verification to track the backtest run
  await db
    .update(tradingViewVerifications)
    .set({ status: "AWAITING_PARITY", updatedAt: new Date() })
    .where(eq(tradingViewVerifications.id, verificationId));

  await writeAuditEvent({
    db,
    orgId,
    actorType: "SYSTEM",
    actorId: "parse-worker",
    action: "backtest_run.trades_parsed",
    aggregateType: "backtest_run",
    aggregateId: runId,
    newStateSummary: {
      tradeCount: metrics.tradeCount,
      netProfit: metrics.netProfit,
      maxDrawdownAbs,
    },
    traceId,
  });
}

async function tryComputeParity(
  db: Db,
  _orgId: string,
  verificationId: string,
  tvSummary: ReturnType<typeof parseSummaryCSV>["summary"],
  _traceId?: string,
) {

  // Find the most recent backtest run for this verification
  const runRows = await db
    .select()
    .from(backtestRuns)
    .where(eq(backtestRuns.verificationId, verificationId))
    .orderBy(backtestRuns.createdAt)
    .limit(1);

  const run = runRows[0];
  if (!run) return; // Trades not yet ingested — parity will run after trade ingestion

  // Get ARF metrics from stored snapshots
  const snapshotRows = await db
    .select()
    .from(metricSnapshots)
    .where(
      and(
        eq(metricSnapshots.scopeType, "backtest_run"),
        eq(metricSnapshots.scopeId, run.id),
      ),
    );

  const getMetric = (name: string) =>
    snapshotRows.find((s) => s.metricName === name)?.value ?? "0";

  const arfMetrics = {
    tradeCount: parseInt(getMetric("trade_count"), 10),
    grossProfit: getMetric("gross_profit"),
    grossLoss: getMetric("gross_loss"),
    netProfit: getMetric("net_profit"),
    profitFactor: getMetric("profit_factor"),
    winRate: getMetric("win_rate"),
    avgWin: getMetric("avg_win"),
    avgLoss: getMetric("avg_loss"),
    payoffRatio: getMetric("payoff_ratio"),
    totalCommission: getMetric("total_commission"),
    longestLosingStreak: parseInt(getMetric("longest_losing_streak"), 10),
    avgHoldingDurationHours: getMetric("avg_holding_hours") || null,
  };

  const maxDrawdownAbs = getMetric("max_drawdown_abs");
  const parityResult = computeParityReport(tvSummary, arfMetrics, maxDrawdownAbs);

  const reportId = uuidv7();
  await db.insert(parityReports).values({
    id: reportId,
    verificationId,
    backtestRunId: run.id,
    status: parityResult.status,
    tvTradeCount: parityResult.tvTradeCount ?? null,
    arfTradeCount: parityResult.arfTradeCount ?? null,
    tvNetProfit: parityResult.tvNetProfit ?? null,
    arfNetProfit: parityResult.arfNetProfit ?? null,
    tvMaxDrawdown: parityResult.tvMaxDrawdown ?? null,
    arfMaxDrawdown: parityResult.arfMaxDrawdown ?? null,
    firstTradeDivergence: parityResult.firstTradeDivergence ?? null,
    warnings: parityResult.warnings,
    policyVersion: parityResult.policyVersion,
  });

  await db
    .update(tradingViewVerifications)
    .set({
      status: parityResult.status === "PASS" ? "VERIFIED" : "PARITY_FAILED",
      parityReportId: reportId,
      updatedAt: new Date(),
    })
    .where(eq(tradingViewVerifications.id, verificationId));
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
