import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { parseSummaryCSV } from "../csv/summary-parser.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_ROOT = resolve(__dirname, "../../../../pine/fixtures/tradingview-exports");
const readFixture = (variant: string, file: string) =>
  readFileSync(resolve(FIXTURES_ROOT, variant, file), "utf-8");

describe("parseSummaryCSV — golden TradingView export fixtures", () => {
  it("parses the clean US-locale summary with no warnings", () => {
    const csv = readFixture("clean-us", "performance-summary.csv");
    const { summary, warnings } = parseSummaryCSV(csv);
    expect(warnings).toHaveLength(0);
    expect(summary.netProfit).toBe("57.00");
    expect(summary.grossProfit).toBe("98.00");
    expect(summary.grossLoss).toBe("-41.00");
    expect(summary.maxDrawdownAbs).toBe("41.00");
    expect(summary.tradeCount).toBe(3);
    expect(parseFloat(summary.winRate)).toBeCloseTo(0.6667, 4);
  });

  it("parses the EU-locale summary, normalising decimal commas, and flags the unrecognised row", () => {
    const csv = readFixture("eu-locale-unknown-column", "performance-summary.csv");
    const { summary, warnings } = parseSummaryCSV(csv);
    expect(summary.netProfit).toBe("19.50");
    expect(summary.grossLoss).toBe("-2.00");
    expect(summary.tradeCount).toBe(1);
    expect(parseFloat(summary.winRate)).toBeCloseTo(1, 4);
    const unknownRowWarning = warnings.find((w) => w.code === "UNKNOWN_ROW");
    expect(unknownRowWarning?.message).toContain("Sharpe Ratio");
  });

  it("warns when required metrics are missing", () => {
    const { warnings } = parseSummaryCSV("Some Unknown Label,42");
    expect(warnings.some((w) => w.code === "MISSING_METRICS")).toBe(true);
    expect(warnings.some((w) => w.code === "UNKNOWN_ROW")).toBe(true);
  });
});
