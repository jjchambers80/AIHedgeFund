import { describe, it, expect } from "vitest";
import { reconstructEquity, computeDrawdown } from "../equity.js";
import type { ParsedTrade } from "@arf-os/pine";

function makeTrade(tradeNumber: number, netPnl: string): ParsedTrade {
  return {
    tradeNumber,
    direction: "LONG",
    entryTime: `2024-01-${String(tradeNumber).padStart(2, "0")}T09:00:00Z`,
    exitTime: `2024-01-${String(tradeNumber).padStart(2, "0")}T17:00:00Z`,
    entryPrice: "100",
    exitPrice: "110",
    quantity: "1",
    grossPnl: netPnl,
    commission: "0",
    netPnl,
    entryReason: null,
    exitReason: null,
  };
}

describe("reconstructEquity", () => {
  it("starts at initial capital", () => {
    const trades = [makeTrade(1, "100"), makeTrade(2, "-50")];
    const points = reconstructEquity(trades, "10000");
    expect(points[0]?.equity).toBe("10000.00000000");
  });

  it("accumulates PnL correctly", () => {
    const trades = [makeTrade(1, "200"), makeTrade(2, "-100"), makeTrade(3, "50")];
    const points = reconstructEquity(trades, "10000");
    // After trade 1: 10200
    expect(points[1]?.equity).toBe("10200.00000000");
    // After trade 2: 10100
    expect(points[2]?.equity).toBe("10100.00000000");
    // After trade 3: 10150
    expect(points[3]?.equity).toBe("10150.00000000");
  });

  it("produces n+1 points for n trades (includes initial)", () => {
    const trades = [makeTrade(1, "100"), makeTrade(2, "200")];
    const points = reconstructEquity(trades, "10000");
    expect(points).toHaveLength(3);
  });
});

describe("computeDrawdown", () => {
  it("is zero at peak equity", () => {
    const trades = [makeTrade(1, "100"), makeTrade(2, "200")];
    const points = reconstructEquity(trades, "10000");
    const { points: dd, maxDrawdownAbs } = computeDrawdown(points);
    // All upward — no drawdown
    expect(parseFloat(maxDrawdownAbs)).toBe(0);
    dd.forEach((p) => expect(parseFloat(p.drawdownAbs)).toBe(0));
  });

  it("computes max drawdown correctly", () => {
    // 10000 → 11000 (peak) → 10500 → 10200 (drawdown = 800)
    const trades = [
      makeTrade(1, "1000"),   // 11000
      makeTrade(2, "-500"),   // 10500
      makeTrade(3, "-300"),   // 10200 — max drawdown from peak 11000
    ];
    const points = reconstructEquity(trades, "10000");
    const { maxDrawdownAbs, maxDrawdownPct } = computeDrawdown(points);
    expect(parseFloat(maxDrawdownAbs)).toBeCloseTo(800, 4);
    expect(parseFloat(maxDrawdownPct)).toBeCloseTo(800 / 11000, 4);
  });

  it("handles all losing trades", () => {
    const trades = [makeTrade(1, "-100"), makeTrade(2, "-200")];
    const points = reconstructEquity(trades, "10000");
    const { maxDrawdownAbs } = computeDrawdown(points);
    // Max drawdown is 300 (from initial capital = peak)
    expect(parseFloat(maxDrawdownAbs)).toBeCloseTo(300, 4);
  });
});
