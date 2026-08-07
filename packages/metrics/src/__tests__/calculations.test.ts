/**
 * Unit tests for computeTradeMetrics.
 * All expected values hand-calculated to verify ARF-OS independent calculations.
 */
import { describe, it, expect } from "vitest";
import { computeTradeMetrics } from "../calculations.js";
import type { ParsedTrade } from "@arf-os/pine";

function makeTrade(
  tradeNumber: number,
  netPnl: string,
  commission = "0",
  entryTime = "2024-01-01T09:00:00Z",
  exitTime = "2024-01-01T17:00:00Z",
): ParsedTrade {
  return {
    tradeNumber,
    direction: "LONG",
    entryTime,
    exitTime,
    entryPrice: "100",
    exitPrice: "110",
    quantity: "1",
    grossPnl: netPnl,
    commission,
    netPnl,
    entryReason: null,
    exitReason: null,
  };
}

describe("computeTradeMetrics", () => {
  it("returns zeroes for empty trade list", () => {
    const m = computeTradeMetrics([]);
    expect(m.tradeCount).toBe(0);
    expect(m.netProfit).toBe("0");
    expect(m.winRate).toBe("0");
    expect(m.avgHoldingDurationHours).toBeNull();
  });

  it("computes correct metrics for simple win/loss sequence", () => {
    const trades = [
      makeTrade(1, "200"),   // win
      makeTrade(2, "-100"),  // loss
      makeTrade(3, "150"),   // win
      makeTrade(4, "-50"),   // loss
    ];
    const m = computeTradeMetrics(trades);

    expect(m.tradeCount).toBe(4);
    // gross profit = 200 + 150 = 350
    expect(m.grossProfit).toBe("350.00000000");
    // gross loss = 100 + 50 = 150
    expect(m.grossLoss).toBe("150.00000000");
    // net = 350 - 150 = 200
    expect(m.netProfit).toBe("200.00000000");
    // profit factor = 350/150 ≈ 2.3333...
    expect(parseFloat(m.profitFactor)).toBeCloseTo(7 / 3, 5);
    // win rate = 2/4 = 0.5
    expect(m.winRate).toBe("0.50000000");
    // avg win = (200+150)/2 = 175
    expect(m.avgWin).toBe("175.00000000");
    // avg loss = (100+50)/2 = 75
    expect(m.avgLoss).toBe("75.00000000");
    // payoff ratio = 175/75 ≈ 2.333...
    expect(parseFloat(m.payoffRatio)).toBeCloseTo(7 / 3, 5);
  });

  it("tracks longest losing streak correctly", () => {
    const trades = [
      makeTrade(1, "100"),
      makeTrade(2, "-10"),
      makeTrade(3, "-20"),
      makeTrade(4, "-30"), // streak of 3
      makeTrade(5, "50"),
      makeTrade(6, "-10"),
    ];
    const m = computeTradeMetrics(trades);
    expect(m.longestLosingStreak).toBe(3);
  });

  it("handles all-winning trades", () => {
    const trades = [makeTrade(1, "100"), makeTrade(2, "200"), makeTrade(3, "50")];
    const m = computeTradeMetrics(trades);
    expect(m.longestLosingStreak).toBe(0);
    expect(m.winRate).toBe("1.00000000");
    expect(parseFloat(m.profitFactor)).toBe(0); // no gross loss → 0 (not Infinity)
  });

  it("deducts commission from totals correctly", () => {
    const trades = [
      { ...makeTrade(1, "190"), commission: "10", netPnl: "190" },
    ];
    const m = computeTradeMetrics(trades);
    expect(m.totalCommission).toBe("10.00000000");
    expect(m.netProfit).toBe("190.00000000");
  });

  it("computes holding duration from timestamps", () => {
    const trades = [
      makeTrade(1, "100", "0", "2024-01-01T09:00:00Z", "2024-01-01T11:00:00Z"), // 2h
      makeTrade(2, "50", "0", "2024-01-02T09:00:00Z", "2024-01-02T13:00:00Z"),  // 4h
    ];
    const m = computeTradeMetrics(trades);
    // avg = (2+4)/2 = 3h
    expect(m.avgHoldingDurationHours).not.toBeNull();
    expect(parseFloat(m.avgHoldingDurationHours!)).toBeCloseTo(3.0, 3);
  });

  it("break-even trade resets losing streak", () => {
    const trades = [
      makeTrade(1, "-10"),
      makeTrade(2, "0"),   // break-even
      makeTrade(3, "-10"),
    ];
    const m = computeTradeMetrics(trades);
    expect(m.longestLosingStreak).toBe(1); // break-even resets
  });
});
