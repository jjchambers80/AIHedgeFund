/**
 * Versioned parser for TradingView "Performance Summary" CSV export.
 * Parser version: 1.0.0
 *
 * The Performance Summary tab contains key/value rows rather than a trade table.
 * We extract the recognised metrics and warn on unknown rows.
 */

import { detectDelimiter, detectDecimalSeparator, normaliseNumber } from "./detect.js";
import type { SummaryParseResult, ParseWarning, ParsedPerformanceSummary } from "./types.js";

const PARSER_VERSION = "1.0.0";

/** Maps known TradingView metric label variants to canonical field names. */
const METRIC_MAP: Record<string, keyof ParsedPerformanceSummary> = {
  "net profit": "netProfit",
  "net profit %": "netProfit",
  "gross profit": "grossProfit",
  "gross loss": "grossLoss",
  "max drawdown": "maxDrawdownAbs",
  "max drawdown %": "maxDrawdownPct",
  "max strategy drawdown": "maxDrawdownAbs",
  "total closed trades": "tradeCount",
  "number of trades": "tradeCount",
  "percent profitable": "winRate",
  "% profitable": "winRate",
  "profit factor": "profitFactor",
  "initial capital": "initialCapital",
};

function normaliseLabelKey(label: string): string {
  return label.toLowerCase().trim().replace(/\s+/g, " ");
}

export function parseSummaryCSV(csvText: string): SummaryParseResult {
  const warnings: ParseWarning[] = [];
  const delimiter = detectDelimiter(csvText);
  const decimalSep = detectDecimalSeparator(csvText, delimiter);

  const partial: Partial<ParsedPerformanceSummary> = {
    currency: "USD",
  };

  const unknownLabels = new Set<string>();
  const lines = csvText.trim().split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = line.split(delimiter).map((c) => c.replace(/"/g, "").trim());
    if (cols.length < 2) continue;

    const label = normaliseLabelKey(cols[0] ?? "");
    const rawValue = cols[1] ?? "";

    const field = METRIC_MAP[label];
    if (!field) {
      if (label) unknownLabels.add(cols[0] ?? label);
      continue; // not a metric we consume — flagged below, not fatal
    }

    const cleaned = rawValue.replace(/%/g, "").trim();
    const normalised = normaliseNumber(cleaned, decimalSep);

    if (field === "tradeCount") {
      const n = parseInt(normalised, 10);
      if (!isNaN(n)) partial[field] = n;
    } else if (field === "winRate" || field === "maxDrawdownPct") {
      // Convert percentage values (e.g. "55.3") → decimal fraction "0.553"
      const n = parseFloat(normalised);
      if (!isNaN(n)) {
        // TradingView shows win rate as "55.30" meaning 55.30%
        partial[field] = (n / 100).toFixed(6);
      }
    } else {
      if (normalised && !isNaN(parseFloat(normalised))) {
        (partial as Record<string, unknown>)[field] = normalised;
      }
    }
  }

  const required: (keyof ParsedPerformanceSummary)[] = ["netProfit", "tradeCount"];
  const missing = required.filter((f) => partial[f] === undefined);
  if (missing.length > 0) {
    warnings.push({
      code: "MISSING_METRICS",
      message: `Could not find required metrics: ${missing.join(", ")}`,
    });
  }
  if (unknownLabels.size > 0) {
    warnings.push({
      code: "UNKNOWN_ROW",
      message: `Unrecognised row label(s), values ignored: ${[...unknownLabels].join(", ")}`,
    });
  }

  const summary: ParsedPerformanceSummary = {
    netProfit: partial.netProfit ?? "0",
    grossProfit: partial.grossProfit ?? "0",
    grossLoss: partial.grossLoss ?? "0",
    maxDrawdownAbs: partial.maxDrawdownAbs ?? "0",
    maxDrawdownPct: partial.maxDrawdownPct ?? "0",
    tradeCount: partial.tradeCount ?? 0,
    winRate: partial.winRate ?? "0",
    profitFactor: partial.profitFactor ?? "0",
    initialCapital: partial.initialCapital ?? "100000",
    currency: partial.currency ?? "USD",
  };

  return { parserVersion: PARSER_VERSION, summary, warnings };
}
