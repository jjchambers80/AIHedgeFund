/**
 * parse-report job.
 *
 * Triggered when a report upload is marked QUEUED.
 * Downloads from R2, parses CSV, stores trades, computes metrics, triggers parity.
 *
 * Idempotent: re-running for a COMPLETE upload is a no-op.
 * Does NOT change strategy lifecycle state — emits a domain event instead.
 */
import type { Job } from "bullmq";
import { eq, and } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import type { Db } from "@arf-os/db";
import {
  reportUploads,
  backtestRuns,
  trades as tradesTable,
  equityPoints,
  drawdownPoints,
  metricSnapshots,
  tradingViewVerifications,
  parityReports,
  getObject,
} from "@arf-os/db";
import { parseTradesCSV, parseSummaryCSV } from "@arf-os/pine";
import {
  computeTradeMetrics,
  CALCULATION_VERSION,
  reconstructEquity,
  computeDrawdown,
  computeParityReport,
} from "@arf-os/metrics";

export const PARSE_REPORT_QUEUE = "arf-os:parse-report";

export interface ParseReportJobData {
  uploadId: string;
  verificationId: string;
  objectKey: string;
  reportType: "PERFORMANCE_SUMMARY" | "LIST_OF_TRADES";
  orgId: string;
}

export async function parseReportJob(db: Db, job: Job): Promise<void> {
  const data = job.data as ParseReportJobData;
  const { uploadId, verificationId, objectKey, reportType, orgId } = data;

  // Idempotency: check current status
  const uploadRows = await db
    .select()
    .from(reportUploads)
    .where(eq(reportUploads.id, uploadId));

  const upload = uploadRows[0];
  if (!upload) throw new Error(`Upload ${uploadId} not found`);
  if (upload.parseStatus === "COMPLETE") {
    job.log("Upload already COMPLETE — idempotent no-op");
    return;
  }
  if (upload.parseStatus !== "QUEUED") {
    throw new Error(`Upload ${uploadId} is in status ${upload.parseStatus}, expected QUEUED`);
  }

  // Mark as parsing
  await db
    .update(reportUploads)
    .set({ parseStatus: "PARSING", updatedAt: new Date() })
    .where(eq(reportUploads.id, uploadId));

  job.log(`Downloading ${objectKey} from R2`);
  const csvBuffer = await getObject(objectKey);
  const csvText = csvBuffer.toString("utf-8");

  if (reportType === "LIST_OF_TRADES") {
    const result = parseTradesCSV(csvText);
    job.log(`Parsed ${result.trades.length} trades with ${result.warnings.length} warnings`);

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
      await storeTrades(db, verificationId, result.trades, orgId, job);
    }
  } else {
    // PERFORMANCE_SUMMARY
    const result = parseSummaryCSV(csvText);
    job.log(`Parsed performance summary: ${result.warnings.length} warnings`);

    await db
      .update(reportUploads)
      .set({
        parseStatus: "COMPLETE",
        parserVersion: "1.0.0",
        updatedAt: new Date(),
      })
      .where(eq(reportUploads.id, uploadId));

    await tryComputeParity(db, verificationId, result.summary, job);
  }
}

async function storeTrades(
  db: Db,
  verificationId: string,
  parsedTrades: ReturnType<typeof parseTradesCSV>["trades"],
  _orgId: string,
  job: Job,
) {
  const verifRows = await db
    .select()
    .from(tradingViewVerifications)
    .where(eq(tradingViewVerifications.id, verificationId));

  const verif = verifRows[0];
  if (!verif) throw new Error(`Verification ${verificationId} not found`);

  const runId = uuidv7();
  await db.insert(backtestRuns).values({
    id: runId,
    strategyVersionId: verif.strategyVersionId,
    verificationId,
    runnerType: "TRADINGVIEW_CSV",
    runnerVersion: "1.0.0",
    symbol: verif.symbol,
    timeframe: verif.timeframe,
    dateFrom: verif.dateFrom ?? null,
    dateTo: verif.dateTo ?? null,
    initialCapital: "100000",
    currency: "USD",
    status: "COMPLETE",
    tradeCount: parsedTrades.length,
    startedAt: new Date(),
    completedAt: new Date(),
  });

  job.log(`Created backtest run ${runId} with ${parsedTrades.length} trades`);

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

  // Metrics
  const metrics = computeTradeMetrics(parsedTrades);
  const equityPointsList = reconstructEquity(parsedTrades, "100000");
  const { points: ddPoints, maxDrawdownAbs, maxDrawdownPct } = computeDrawdown(equityPointsList);

  for (const ep of equityPointsList) {
    await db.insert(equityPoints).values({
      id: uuidv7(),
      backtestRunId: runId,
      tradeNumber: ep.tradeNumber,
      timestamp: new Date(ep.timestamp),
      equity: ep.equity,
    });
  }

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

  const metricEntries = [
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
    ...(metrics.avgHoldingDurationHours !== null
      ? [{ name: "avg_holding_hours", value: metrics.avgHoldingDurationHours, unit: "hours" }]
      : []),
  ];

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

  job.log(`Stored ${metricEntries.length} metric snapshots`);

  await db
    .update(tradingViewVerifications)
    .set({ status: "AWAITING_PARITY", updatedAt: new Date() })
    .where(eq(tradingViewVerifications.id, verificationId));

  // Attempt parity immediately if summary is already uploaded
  await tryComputeParity(db, verificationId, null, job);
}

async function tryComputeParity(
  db: Db,
  verificationId: string,
  tvSummary: ReturnType<typeof parseSummaryCSV>["summary"] | null,
  job: Job,
) {
  // Find the backtest run
  const runRows = await db
    .select()
    .from(backtestRuns)
    .where(eq(backtestRuns.verificationId, verificationId))
    .limit(1);

  const run = runRows[0];
  if (!run) {
    job.log("No backtest run yet — parity deferred until trades are stored");
    return;
  }

  // If no TV summary passed, check if one was already uploaded
  let summaryToUse = tvSummary;
  if (!summaryToUse) {
    const summaryUpload = await db
      .select()
      .from(reportUploads)
      .where(
        and(
          eq(reportUploads.verificationId, verificationId),
          eq(reportUploads.reportType, "PERFORMANCE_SUMMARY"),
          eq(reportUploads.parseStatus, "COMPLETE"),
        ),
      )
      .limit(1);

    if (!summaryUpload[0]) {
      job.log("No performance summary yet — parity deferred");
      return;
    }
    // Re-parse the stored summary
    const buf = await getObject(summaryUpload[0].objectKey);
    const { summary } = parseSummaryCSV(buf.toString("utf-8"));
    summaryToUse = summary;
  }

  // Get ARF metrics from stored snapshots
  const snapshots = await db
    .select()
    .from(metricSnapshots)
    .where(
      and(
        eq(metricSnapshots.scopeType, "backtest_run"),
        eq(metricSnapshots.scopeId, run.id),
      ),
    );

  const getMetric = (name: string) =>
    snapshots.find((s) => s.metricName === name)?.value ?? "0";

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
  const parityResult = computeParityReport(summaryToUse, arfMetrics, maxDrawdownAbs);

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

  job.log(`Parity: ${parityResult.status} — ${parityResult.warnings.length} warnings`);
}
