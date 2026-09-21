/**
 * Unit tests for @arf-os/backtest-sdk.
 *
 * Tests the TradingViewCsvRunner capabilities and interface compliance.
 * A real Pine-compatible runner is a later milestone.
 */
import { describe, it, expect } from "vitest";
import { TradingViewCsvRunner } from "../index.js";
import type { BacktestRunId } from "../index.js";

describe("TradingViewCsvRunner", () => {
  const runner = new TradingViewCsvRunner();

  it("reports correct capabilities", () => {
    const caps = runner.capabilities();
    expect(caps.runnerName).toBe("TRADINGVIEW_CSV");
    expect(caps.runnerVersion).toBe("1.0.0");
    expect(caps.maxPineVersion).toBe("6");
    expect(caps.supportsLocalCompile).toBe(false);
    expect(caps.supportsParameterSweep).toBe(false);
    expect(caps.producesFullTradeLedger).toBe(true);
  });

  it("compile() returns false with an explanatory error", async () => {
    const result = await runner.compile({ source: "//@version=6\nstrategy('test')" });
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("TradingViewCsvRunner does not support local compilation");
  });

  it("run() throws with a clear message directing to the CSV pipeline", async () => {
    await expect(
      runner.run({
        runId: "01J0000000000000000000000A" as BacktestRunId,
        strategyVersionId: "01J0000000000000000000000B" as import("../index.js").StrategyVersionId,
        source: "//@version=6\nstrategy('test')",
        manifest: {},
        symbol: "BYBIT:BTCUSDT.P",
        timeframe: "60",
      }),
    ).rejects.toThrow("TradingViewCsvRunner.run()");
  });

  it("cancel() is a no-op and does not throw", async () => {
    await expect(
      runner.cancel("01J0000000000000000000000A" as BacktestRunId),
    ).resolves.toBeUndefined();
  });
});
