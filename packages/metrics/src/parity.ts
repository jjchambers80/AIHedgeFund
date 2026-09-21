/**
 * Parity check between TradingView-reported metrics and ARF-OS independently calculated metrics.
 * Result: PASS | WARN | FAIL | INSUFFICIENT_DATA
 */
import { Decimal } from "decimal.js";
import type { ParsedPerformanceSummary } from "@arf-os/pine";
import type { TradeMetrics } from "./calculations.js";

export type ParityStatus = "PASS" | "WARN" | "FAIL" | "INSUFFICIENT_DATA";

/**
 * TradingView's Performance Summary export has no trade-level detail (that's
 * what List of Trades is for), and List of Trades *is* our only trade-level
 * data source — there is no independent TV trade sequence to diff against.
 * So "first trade divergence" here is redefined as an internal-consistency
 * check: the first trade where the CSV-reported net P&L disagrees with the
 * net P&L recomputed from entry/exit price × quantity − commission, beyond
 * a one-cent tolerance for CSV rounding. This catches parser/data corruption
 * (e.g. a misaligned column) rather than a fabricated TV-vs-ARF comparison.
 */
const DIVERGENCE_TOLERANCE_ABS = new Decimal("0.01");

export interface FirstTradeDivergence {
  tradeNumber: number;
  reportedNetPnl: string;
  recomputedNetPnl: string;
  diff: string;
}

/** Minimal per-trade shape needed to recompute price-based P&L — satisfied
 *  by both `ParsedTrade` (fresh parse) and the `trades` DB row shape. */
export interface DivergenceTradeInput {
  tradeNumber: number;
  direction: "LONG" | "SHORT";
  entryPrice: string;
  exitPrice: string;
  quantity: string;
  commission: string;
  netPnl: string;
}

export function findFirstTradeDivergence(trades: DivergenceTradeInput[]): FirstTradeDivergence | null {
  const sorted = [...trades].sort((a, b) => a.tradeNumber - b.tradeNumber);
  for (const t of sorted) {
    const entry = new Decimal(t.entryPrice);
    const exit = new Decimal(t.exitPrice);
    const qty = new Decimal(t.quantity);
    const commission = new Decimal(t.commission);
    const grossRecomputed = t.direction === "LONG" ? exit.sub(entry).mul(qty) : entry.sub(exit).mul(qty);
    const netRecomputed = grossRecomputed.sub(commission);
    const reported = new Decimal(t.netPnl);
    const diff = netRecomputed.sub(reported).abs();
    if (diff.greaterThan(DIVERGENCE_TOLERANCE_ABS)) {
      return {
        tradeNumber: t.tradeNumber,
        reportedNetPnl: reported.toFixed(8),
        recomputedNetPnl: netRecomputed.toFixed(8),
        diff: diff.toFixed(8),
      };
    }
  }
  return null;
}

function formatDivergence(d: FirstTradeDivergence | null): string | null {
  if (!d) return null;
  return `Trade ${d.tradeNumber}: reported netPnl=${d.reportedNetPnl}, recomputed=${d.recomputedNetPnl} (diff ${d.diff})`;
}

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
  trades: DivergenceTradeInput[] = [],
): ParityCheckResult {
  const warnings: string[] = [];
  const firstTradeDivergence = formatDivergence(findFirstTradeDivergence(trades));
  if (firstTradeDivergence) {
    warnings.push(`Internal consistency: ${firstTradeDivergence}`);
  }

  if (!tvSummary) {
    return {
      status: firstTradeDivergence ? "FAIL" : "INSUFFICIENT_DATA",
      tvTradeCount: null,
      arfTradeCount: arfMetrics.tradeCount,
      tvNetProfit: null,
      arfNetProfit: arfMetrics.netProfit,
      tvMaxDrawdown: null,
      arfMaxDrawdown: arfMaxDrawdownAbs,
      firstTradeDivergence,
      warnings: firstTradeDivergence ? warnings : ["No TradingView Performance Summary uploaded"],
      policyVersion: POLICY_VERSION,
    };
  }

  let status: ParityStatus = firstTradeDivergence ? "FAIL" : "PASS";

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
    firstTradeDivergence,
    warnings,
    policyVersion: POLICY_VERSION,
  };
}
