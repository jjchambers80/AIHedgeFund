/**
 * Reconstruct equity and drawdown curves from the parsed trade ledger.
 * Never reads values from screenshots or TV-reported metrics directly.
 */
import { Decimal } from "decimal.js";
import type { ParsedTrade } from "@arf-os/pine";

export interface EquityPoint {
  tradeNumber: number;
  timestamp: string;  // ISO 8601 — exit time of trade
  equity: string;     // decimal string
}

export interface DrawdownPoint {
  tradeNumber: number;
  timestamp: string;
  drawdownAbs: string;  // absolute drawdown from peak
  drawdownPct: string;  // fractional, e.g. "0.1523" = 15.23%
}

export interface MaxDrawdownResult {
  maxDrawdownAbs: string;
  maxDrawdownPct: string;
}

export function reconstructEquity(
  trades: ParsedTrade[],
  initialCapital: string,
): EquityPoint[] {
  let equity = new Decimal(initialCapital);
  const points: EquityPoint[] = [
    { tradeNumber: 0, timestamp: trades[0]?.entryTime ?? new Date().toISOString(), equity: equity.toFixed(8) },
  ];

  for (const trade of trades) {
    equity = equity.add(new Decimal(trade.netPnl));
    points.push({
      tradeNumber: trade.tradeNumber,
      timestamp: trade.exitTime,
      equity: equity.toFixed(8),
    });
  }

  return points;
}

export function computeDrawdown(equityPoints: EquityPoint[]): {
  points: DrawdownPoint[];
  maxDrawdownAbs: string;
  maxDrawdownPct: string;
} {
  let peak = new Decimal(equityPoints[0]?.equity ?? "0");
  let maxDrawdownAbs = new Decimal(0);
  let maxDrawdownPct = new Decimal(0);
  const points: DrawdownPoint[] = [];

  for (const ep of equityPoints) {
    const eq = new Decimal(ep.equity);
    if (eq.greaterThan(peak)) peak = eq;

    const ddAbs = peak.sub(eq);
    const ddPct = peak.greaterThan(0) ? ddAbs.div(peak) : new Decimal(0);

    if (ddAbs.greaterThan(maxDrawdownAbs)) maxDrawdownAbs = ddAbs;
    if (ddPct.greaterThan(maxDrawdownPct)) maxDrawdownPct = ddPct;

    points.push({
      tradeNumber: ep.tradeNumber,
      timestamp: ep.timestamp,
      drawdownAbs: ddAbs.toFixed(8),
      drawdownPct: ddPct.toFixed(8),
    });
  }

  return {
    points,
    maxDrawdownAbs: maxDrawdownAbs.toFixed(8),
    maxDrawdownPct: maxDrawdownPct.toFixed(8),
  };
}
