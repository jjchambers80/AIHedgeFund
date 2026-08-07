/**
 * Parity check between TradingView-reported metrics and ARF-OS independently calculated metrics.
 * Result: PASS | WARN | FAIL | INSUFFICIENT_DATA
 */
import Decimal from "decimal.js";
import type { ParsedPerformanceSummary } from "@arf-os/pine";
import type { TradeMetrics } from "./calculations.js";

export type ParityStatus = "PASS" | "WARN" | "FAIL" | "INSUFFICIENT_DATA";

export interface ParityCheckResult {
  status: ParityStatus;
  tvTradeCount: number | null;
  arfTradeCount: number | null;
  tvNetProfit: string | null;
  arfNetProfit: string | null;
  tvMaxDrawdown: string | null;
  arfMaxDrawdown: string | null;
  firstTradeDivergence: string | null;
  warnings: string[];
  policyVersion: string;
}

const POLICY_VERSION = "1.0.0";

/** Maximum allowed relative difference before flagging as WARN vs FAIL. */
const WARN_THRESHOLD = new Decimal("0.01");   // 1%
const FAIL_THRESHOLD = new Decimal("0.05");   // 5%

function relativeDiff(a: Decimal, b: Decimal): Decimal {
  if (a.isZero() && b.isZero()) return new Decimal(0);
  const denom = a.abs().greaterThan(b.abs()) ? a.abs() : b.abs();
  return a.sub(b).abs().div(denom);
}

export function computeParityReport(
  tvSummary: ParsedPerformanceSummary | null,
  arfMetrics: TradeMetrics,
  arfMaxDrawdownAbs: string,
): ParityCheckResult {
  const warnings: string[] = [];

  if (!tvSummary) {
    return {
      status: "INSUFFICIENT_DATA",
      tvTradeCount: null,
      arfTradeCount: arfMetrics.tradeCount,
      tvNetProfit: null,
      arfNetProfit: arfMetrics.netProfit,
      tvMaxDrawdown: null,
      arfMaxDrawdown: arfMaxDrawdownAbs,
      firstTradeDivergence: null,
      warnings: ["No TradingView Performance Summary uploaded"],
      policyVersion: POLICY_VERSION,
    };
  }

  let status: ParityStatus = "PASS";

  // Trade count
  const tvCount = tvSummary.tradeCount;
  const arfCount = arfMetrics.tradeCount;
  if (tvCount !== arfCount) {
    const diff = Math.abs(tvCount - arfCount);
    const msg = `Trade count mismatch: TV=${tvCount}, ARF=${arfCount} (diff=${diff})`;
    warnings.push(msg);
    status = diff > 5 ? "FAIL" : "WARN";
  }

  // Net profit
  const tvProfit = new Decimal(tvSummary.netProfit);
  const arfProfit = new Decimal(arfMetrics.netProfit);
  const profitDiff = relativeDiff(tvProfit, arfProfit);
  if (profitDiff.greaterThan(FAIL_THRESHOLD)) {
    warnings.push(`Net profit divergence: TV=${tvSummary.netProfit}, ARF=${arfMetrics.netProfit} (${profitDiff.mul(100).toFixed(2)}%)`);
    status = "FAIL";
  } else if (profitDiff.greaterThan(WARN_THRESHOLD)) {
    warnings.push(`Net profit minor difference: TV=${tvSummary.netProfit}, ARF=${arfMetrics.netProfit} (${profitDiff.mul(100).toFixed(2)}%)`);
    if (status === "PASS") status = "WARN";
  }

  // Max drawdown
  const tvDD = new Decimal(tvSummary.maxDrawdownAbs);
  const arfDD = new Decimal(arfMaxDrawdownAbs);
  const ddDiff = relativeDiff(tvDD, arfDD);
  if (ddDiff.greaterThan(FAIL_THRESHOLD)) {
    warnings.push(`Max drawdown divergence: TV=${tvSummary.maxDrawdownAbs}, ARF=${arfMaxDrawdownAbs} (${ddDiff.mul(100).toFixed(2)}%)`);
    if (status !== "FAIL") status = "FAIL";
  } else if (ddDiff.greaterThan(WARN_THRESHOLD)) {
    warnings.push(`Max drawdown minor difference (${ddDiff.mul(100).toFixed(2)}%)`);
    if (status === "PASS") status = "WARN";
  }

  return {
    status,
    tvTradeCount: tvCount,
    arfTradeCount: arfCount,
    tvNetProfit: tvSummary.netProfit,
    arfNetProfit: arfMetrics.netProfit,
    tvMaxDrawdown: tvSummary.maxDrawdownAbs,
    arfMaxDrawdown: arfMaxDrawdownAbs,
    firstTradeDivergence: null,
    warnings,
    policyVersion: POLICY_VERSION,
  };
}
