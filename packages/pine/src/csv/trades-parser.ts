/**
 * Versioned parser for TradingView "List of Trades" CSV export.
 * Parser version: 1.0.0
 *
 * Expected columns (order may vary):
 *   Trade #, Type, Signal, Date/Time, Price, Contracts, Profit, Profit %, Cum. Profit, Run-up, Run-up %, Drawdown, Drawdown %
 *
 * The parser identifies columns by name (case-insensitive), never by position.
 */

import { detectDelimiter, detectDecimalSeparator, normaliseNumber } from "./detect.js";
import type { ParsedTrade, TradeParseResult, ParseWarning } from "./types.js";

const PARSER_VERSION = "1.0.0";

interface RawRow {
  [key: string]: string;
}

/** Map of known column name variants → canonical name. */
const COL_MAP: Record<string, string> = {
  "trade #": "tradeNum",
  "trade#": "tradeNum",
  "#": "tradeNum",
  type: "type",
  signal: "signal",
  "date/time": "dateTime",
  datetime: "dateTime",
  date: "dateTime",
  price: "price",
  contracts: "contracts",
  qty: "contracts",
  quantity: "contracts",
  profit: "profit",
  "profit %": "profitPct",
  commission: "commission",
  "cum. profit": "cumProfit",
};

function normaliseHeader(h: string): string {
  return h.toLowerCase().trim();
}

function parseDateTime(raw: string): string {
  // TradingView format: "2024-01-15 09:30" or "2024-01-15T09:30:00"
  const cleaned = raw.trim().replace(" ", "T");
  const d = new Date(cleaned + (cleaned.includes("Z") ? "" : "Z"));
  if (isNaN(d.getTime())) throw new Error(`Cannot parse date: ${raw}`);
  return d.toISOString();
}

export function parseTradesCSV(csvText: string): TradeParseResult {
  const warnings: ParseWarning[] = [];
  const delimiter = detectDelimiter(csvText);
  const decimalSep = detectDecimalSeparator(csvText);

  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) {
    return { parserVersion: PARSER_VERSION, trades: [], warnings: [{ code: "EMPTY_FILE", message: "File contains no data rows" }] };
  }

  // Parse header
  const headerLine = lines[0] ?? "";
  const rawHeaders = headerLine.split(delimiter).map((h) => h.replace(/"/g, "").trim());
  const colIndex: Record<string, number> = {};
  for (const [i, h] of rawHeaders.entries()) {
    const canonical = COL_MAP[normaliseHeader(h)];
    if (canonical) colIndex[canonical] = i;
  }

  const required = ["tradeNum", "type", "dateTime", "price"];
  const missingRequired = required.filter((c) => colIndex[c] === undefined);
  if (missingRequired.length > 0) {
    return {
      parserVersion: PARSER_VERSION,
      trades: [],
      warnings: [{ code: "MISSING_REQUIRED_COLUMNS", message: `Missing columns: ${missingRequired.join(", ")}` }],
    };
  }

  // Build entry/exit pairs
  // TradingView exports one row per entry and one per exit
  type EntryRow = { tradeNum: number; direction: "LONG" | "SHORT"; dateTime: string; price: string; contracts: string };
  const entries = new Map<number, EntryRow>();
  const trades: ParsedTrade[] = [];

  const get = (row: string[], col: string): string => {
    const idx = colIndex[col];
    return idx !== undefined ? (row[idx] ?? "").replace(/"/g, "").trim() : "";
  };

  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const row = line.split(delimiter);
    const tradeNumRaw = get(row, "tradeNum");
    const type = get(row, "type").toLowerCase();
    if (!tradeNumRaw || !type) continue;

    const tradeNum = parseInt(tradeNumRaw, 10);
    if (isNaN(tradeNum)) continue;

    const dateTimeRaw = get(row, "dateTime");
    const priceRaw = normaliseNumber(get(row, "price"), decimalSep);
    const contractsRaw = normaliseNumber(get(row, "contracts") || "1", decimalSep);
    const profitRaw = normaliseNumber(get(row, "profit") || "0", decimalSep);
    const commissionRaw = normaliseNumber(get(row, "commission") || "0", decimalSep);
    const signal = get(row, "signal");

    let dateTime: string;
    try {
      dateTime = parseDateTime(dateTimeRaw);
    } catch {
      warnings.push({ code: "INVALID_DATE", message: `Trade ${tradeNum}: invalid date "${dateTimeRaw}"` });
      continue;
    }

    if (type.includes("entry") || type === "buy" || type === "sell short") {
      const direction: "LONG" | "SHORT" = type.includes("long") || type === "buy" ? "LONG" : "SHORT";
      entries.set(tradeNum, { tradeNum, direction, dateTime, price: priceRaw, contracts: contractsRaw });
    } else if (type.includes("exit") || type === "sell" || type === "buy to cover") {
      const entry = entries.get(tradeNum);
      if (!entry) {
        warnings.push({ code: "MISSING_ENTRY", message: `Trade ${tradeNum}: exit row without matching entry` });
        continue;
      }
      const netPnl = profitRaw;
      const grossPnl = (parseFloat(netPnl) + parseFloat(commissionRaw)).toFixed(8);

      trades.push({
        tradeNumber: tradeNum,
        direction: entry.direction,
        entryTime: entry.dateTime,
        exitTime: dateTime,
        entryPrice: entry.price,
        exitPrice: priceRaw,
        quantity: entry.contracts,
        grossPnl,
        commission: commissionRaw,
        netPnl,
        entryReason: null,
        exitReason: signal || null,
      });
      entries.delete(tradeNum);
    }
  }

  if (entries.size > 0) {
    warnings.push({
      code: "OPEN_TRADES",
      message: `${entries.size} open trade(s) not included (no exit row): ${[...entries.keys()].join(", ")}`,
    });
  }

  return { parserVersion: PARSER_VERSION, trades, warnings };
}
