/**
 * Independent metric calculations.
 *
 * All calculations use decimal.js to avoid floating-point error.
 * Every exported function is pure and deterministic.
 * Calculation version: 1.0.0
 */
import Decimal from "decimal.js";
import type { ParsedTrade } from "@arf-os/pine";

export const CALCULATION_VERSION = "1.0.0";

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export interface TradeMetrics {
  tradeCount: number;
  grossProfit: string;
  grossLoss: string;
  netProfit: string;
  profitFactor: string;
  winRate: string;       // decimal fraction: 0.55 = 55%
  avgWin: string;
  avgLoss: string;
  payoffRatio: string;
  totalCommission: string;
  longestLosingStreak: number;
  avgHoldingDurationHours: string | null;
}

export function computeTradeMetrics(trades: ParsedTrade[]): TradeMetrics {
  if (trades.length === 0) {
    return {
      tradeCount: 0,
      grossProfit: "0",
      grossLoss: "0",
      netProfit: "0",
      profitFactor: "0",
      winRate: "0",
      avgWin: "0",
      avgLoss: "0",
      payoffRatio: "0",
      totalCommission: "0",
      longestLosingStreak: 0,
      avgHoldingDurationHours: null,
    };
  }

  let grossProfit = new Decimal(0);
  let grossLoss = new Decimal(0);
  let totalCommission = new Decimal(0);
  let wins = 0;
  let losses = 0;
  let totalWin = new Decimal(0);
  let totalLoss = new Decimal(0);
  let currentStreak = 0;
  let maxStreak = 0;
  let totalHoldingMs = 0;
  let holdingCount = 0;

  for (const t of trades) {
    const netPnl = new Decimal(t.netPnl);
    const commission = new Decimal(t.commission);
    totalCommission = totalCommission.add(commission);

    if (netPnl.greaterThan(0)) {
      grossProfit = grossProfit.add(netPnl);
      wins++;
      totalWin = totalWin.add(netPnl);
      currentStreak = 0;
    } else if (netPnl.lessThan(0)) {
      grossLoss = grossLoss.add(netPnl.abs());
      losses++;
      totalLoss = totalLoss.add(netPnl.abs());
      currentStreak++;
      if (currentStreak > maxStreak) maxStreak = currentStreak;
    } else {
      // break-even resets losing streak
      currentStreak = 0;
    }

    // Holding duration
    try {
      const entry = new Date(t.entryTime).getTime();
      const exit = new Date(t.exitTime).getTime();
      if (!isNaN(entry) && !isNaN(exit) && exit > entry) {
        totalHoldingMs += exit - entry;
        holdingCount++;
      }
    } catch {
      // ignore malformed dates
    }
  }

  const netProfit = grossProfit.sub(grossLoss);
  const tradeCount = trades.length;
  const winRate = new Decimal(wins).div(tradeCount);
  const avgWin = wins > 0 ? totalWin.div(wins) : new Decimal(0);
  const avgLoss = losses > 0 ? totalLoss.div(losses) : new Decimal(0);
  const payoffRatio = avgLoss.greaterThan(0) ? avgWin.div(avgLoss) : new Decimal(0);
  const profitFactor = grossLoss.greaterThan(0) ? grossProfit.div(grossLoss) : new Decimal(0);

  const avgHoldingDurationHours =
    holdingCount > 0
      ? new Decimal(totalHoldingMs).div(holdingCount).div(3_600_000).toFixed(4)
      : null;

  return {
    tradeCount,
    grossProfit: grossProfit.toFixed(8),
    grossLoss: grossLoss.toFixed(8),
    netProfit: netProfit.toFixed(8),
    profitFactor: profitFactor.toFixed(8),
    winRate: winRate.toFixed(8),
    avgWin: avgWin.toFixed(8),
    avgLoss: avgLoss.toFixed(8),
    payoffRatio: payoffRatio.toFixed(8),
    totalCommission: totalCommission.toFixed(8),
    longestLosingStreak: maxStreak,
    avgHoldingDurationHours,
  };
}
