/** Parsed output types from TradingView strategy exports. */

export interface ParsedTrade {
  tradeNumber: number;
  direction: "LONG" | "SHORT";
  entryTime: string;   // ISO 8601 UTC
  exitTime: string;    // ISO 8601 UTC
  entryPrice: string;  // decimal string
  exitPrice: string;
  quantity: string;
  grossPnl: string;
  commission: string;
  netPnl: string;
  entryReason: string | null;
  exitReason: string | null;
}

export interface ParsedPerformanceSummary {
  netProfit: string;           // decimal string
  grossProfit: string;
  grossLoss: string;
  maxDrawdownAbs: string;
  maxDrawdownPct: string;      // e.g. "0.1523" = 15.23%
  tradeCount: number;
  winRate: string;             // decimal, e.g. "0.55"
  profitFactor: string;
  initialCapital: string;
  currency: string;
}

export interface ParseWarning {
  code: string;
  message: string;
  context?: string;
}

export interface TradeParseResult {
  parserVersion: string;
  trades: ParsedTrade[];
  warnings: ParseWarning[];
}

export interface SummaryParseResult {
  parserVersion: string;
  summary: ParsedPerformanceSummary;
  warnings: ParseWarning[];
}
