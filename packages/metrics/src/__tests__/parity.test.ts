import { describe, it, expect } from "vitest";
import { computeParityReport, findFirstTradeDivergence, type DivergenceTradeInput } from "../parity.js";
import type { TradeMetrics } from "../calculations.js";
import type { ParsedPerformanceSummary } from "@arf-os/pine";

const baseMetrics: TradeMetrics = {
  tradeCount: 2,
  grossProfit: "60.00000000",
  grossLoss: "10.00000000",
  netProfit: "50.00000000",
  profitFactor: "6.00000000",
  winRate: "0.50000000",
  avgWin: "60.00000000",
  avgLoss: "10.00000000",
  payoffRatio: "6.00000000",
  totalCommission: "2.00000000",
  longestLosingStreak: 1,
  avgHoldingDurationHours: "4.0000",
  monthlyReturns: [],
};

const consistentTrades: DivergenceTradeInput[] = [
  { tradeNumber: 1, direction: "LONG", entryPrice: "100", exitPrice: "160", quantity: "1", commission: "1", netPnl: "59" },
  { tradeNumber: 2, direction: "SHORT", entryPrice: "50", exitPrice: "41", quantity: "1", commission: "1", netPnl: "8" },
];

describe("findFirstTradeDivergence", () => {
  it("returns null when every trade's reported netPnl matches price-based recomputation", () => {
    expect(findFirstTradeDivergence(consistentTrades)).toBeNull();
  });

  it("flags the first trade whose reported netPnl disagrees with entry/exit price math", () => {
    const corrupted: DivergenceTradeInput[] = [
      consistentTrades[0]!,
      { ...consistentTrades[1]!, netPnl: "999.00" }, // CSV profit column doesn't match price math
    ];
    const divergence = findFirstTradeDivergence(corrupted);
    expect(divergence).not.toBeNull();
    expect(divergence!.tradeNumber).toBe(2);
    expect(divergence!.reportedNetPnl).toBe("999.00000000");
  });

  it("tolerates sub-cent rounding noise", () => {
    const rounded: DivergenceTradeInput[] = [
      { tradeNumber: 1, direction: "LONG", entryPrice: "100", exitPrice: "160", quantity: "1", commission: "1", netPnl: "59.004" },
    ];
    expect(findFirstTradeDivergence(rounded)).toBeNull();
  });
});

describe("computeParityReport — firstTradeDivergence integration", () => {
  const tvSummary: ParsedPerformanceSummary = {
    netProfit: "50.00",
    grossProfit: "60.00",
    grossLoss: "10.00",
    maxDrawdownAbs: "10.00",
    maxDrawdownPct: "0.10",
    tradeCount: 2,
    winRate: "0.50",
    profitFactor: "6.00",
    initialCapital: "100000",
    currency: "USD",
  };

  it("passes through null firstTradeDivergence when trades are internally consistent", () => {
    const result = computeParityReport(tvSummary, baseMetrics, "10.00", consistentTrades);
    expect(result.firstTradeDivergence).toBeNull();
  });

  it("forces FAIL and reports the divergence when a trade's math doesn't add up", () => {
    const corrupted: DivergenceTradeInput[] = [
      consistentTrades[0]!,
      { ...consistentTrades[1]!, netPnl: "999.00" },
    ];
    const result = computeParityReport(tvSummary, baseMetrics, "10.00", corrupted);
    expect(result.status).toBe("FAIL");
    expect(result.firstTradeDivergence).toContain("Trade 2");
  });

  it("still surfaces divergence even with no TV summary uploaded (INSUFFICIENT_DATA case)", () => {
    const corrupted: DivergenceTradeInput[] = [{ ...consistentTrades[0]!, netPnl: "0.00" }];
    const result = computeParityReport(null, baseMetrics, "10.00", corrupted);
    expect(result.status).toBe("FAIL");
    expect(result.firstTradeDivergence).toContain("Trade 1");
  });
});
