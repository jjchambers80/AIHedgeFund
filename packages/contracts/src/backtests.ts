import { z } from "zod";
import { TradeDirectionSchema, JobStatusSchema, ParityStatusSchema } from "./enums.js";

// ── TradingView Verification ──────────────────────────────────────────────────

export const TradingViewVerificationSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  strategyVersionId: z.string(),
  pineRevisionId: z.string(),
  symbol: z.string(),
  timeframe: z.string(),
  dateFrom: z.string().date().nullable(),
  dateTo: z.string().date().nullable(),
  status: z.enum(["PENDING", "UPLOADS_RECEIVED", "PROCESSING", "COMPLETE", "FAILED"]),
  parityReportId: z.string().nullable(),
  createdBy: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type TradingViewVerification = z.infer<typeof TradingViewVerificationSchema>;

// ── Report Upload ─────────────────────────────────────────────────────────────

export const ReportUploadSchema = z.object({
  id: z.string(),
  verificationId: z.string(),
  reportType: z.enum(["PERFORMANCE_SUMMARY", "LIST_OF_TRADES"]),
  objectKey: z.string(),
  checksumSha256: z.string(),
  fileSizeBytes: z.number().int(),
  parserVersion: z.string().nullable(),
  parseStatus: JobStatusSchema,
  parseWarnings: z.array(z.string()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ReportUpload = z.infer<typeof ReportUploadSchema>;

// ── Backtest Run ──────────────────────────────────────────────────────────────

export const BacktestRunSchema = z.object({
  id: z.string(),
  strategyVersionId: z.string(),
  verificationId: z.string().nullable(),
  runnerType: z.enum(["TRADINGVIEW_CSV", "LOCAL_STUB"]),
  runnerVersion: z.string(),
  symbol: z.string(),
  timeframe: z.string(),
  dateFrom: z.string().date().nullable(),
  dateTo: z.string().date().nullable(),
  initialCapital: z.string(), // decimal as string
  currency: z.string().default("USD"),
  status: JobStatusSchema,
  tradeCount: z.number().int().nullable(),
  sourceHash: z.string().nullable(),
  parameterSetId: z.string().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type BacktestRun = z.infer<typeof BacktestRunSchema>;

// ── Trade ─────────────────────────────────────────────────────────────────────

export const TradeSchema = z.object({
  id: z.string(),
  backtestRunId: z.string(),
  tradeNumber: z.number().int(),
  direction: TradeDirectionSchema,
  entryTime: z.string().datetime(),
  exitTime: z.string().datetime(),
  entryPrice: z.string(),  // decimal as string
  exitPrice: z.string(),
  quantity: z.string(),
  grossPnl: z.string(),
  commission: z.string(),
  netPnl: z.string(),
  entryReason: z.string().nullable(),
  exitReason: z.string().nullable(),
  parityStatus: z.enum(["MATCHED", "DIVERGED", "UNVERIFIED"]).default("UNVERIFIED"),
});
export type Trade = z.infer<typeof TradeSchema>;

// ── Equity & Drawdown Points ──────────────────────────────────────────────────

export const EquityPointSchema = z.object({
  id: z.string(),
  backtestRunId: z.string(),
  tradeNumber: z.number().int(),
  timestamp: z.string().datetime(),
  equity: z.string(), // decimal
});
export type EquityPoint = z.infer<typeof EquityPointSchema>;

export const DrawdownPointSchema = z.object({
  id: z.string(),
  backtestRunId: z.string(),
  tradeNumber: z.number().int(),
  timestamp: z.string().datetime(),
  drawdownAbs: z.string(), // decimal
  drawdownPct: z.string(), // decimal, e.g. "0.1523" = 15.23%
});
export type DrawdownPoint = z.infer<typeof DrawdownPointSchema>;

// ── Parity Report ─────────────────────────────────────────────────────────────

export const ParityReportSchema = z.object({
  id: z.string(),
  verificationId: z.string(),
  backtestRunId: z.string(),
  status: ParityStatusSchema,
  tvTradeCount: z.number().int().nullable(),
  arfTradeCount: z.number().int().nullable(),
  tvNetProfit: z.string().nullable(),
  arfNetProfit: z.string().nullable(),
  tvMaxDrawdown: z.string().nullable(),
  arfMaxDrawdown: z.string().nullable(),
  firstTradeDivergence: z.string().nullable(), // JSON description of first diff
  warnings: z.array(z.string()),
  policyVersion: z.string(),
  createdAt: z.string().datetime(),
});
export type ParityReport = z.infer<typeof ParityReportSchema>;
