import { describe, it, expect } from "vitest";
import { parseTradesCSV } from "../csv/trades-parser.js";

const SAMPLE_CSV = `Trade #,Type,Signal,Date/Time,Price,Contracts,Profit,Cum. Profit,Commission
1,Entry Long,Order,2024-01-02 09:30,100.50,10,,0,5.00
1,Exit Long,Order,2024-01-02 15:30,102.00,10,150.00,150.00,5.00
2,Entry Long,Order,2024-01-03 09:30,103.00,10,,150.00,5.00
2,Exit Long,Order,2024-01-03 15:30,101.50,10,-150.00,0.00,5.00`;

const SEMICOLON_CSV = `Trade #;Type;Signal;Date/Time;Price;Contracts;Profit;Cum. Profit;Commission
1;Entry Long;Order;2024-01-02 09:30;100,50;10;;0;5,00
1;Exit Long;Order;2024-01-02 15:30;102,00;10;150,00;150,00;5,00`;

describe("parseTradesCSV", () => {
  it("parses comma-delimited English CSV", () => {
    const { trades, warnings } = parseTradesCSV(SAMPLE_CSV);
    expect(trades).toHaveLength(2);
    expect(warnings.filter((w) => w.code === "OPEN_TRADE")).toHaveLength(0);
  });

  it("extracts correct PnL for winning trade", () => {
    const { trades } = parseTradesCSV(SAMPLE_CSV);
    const t1 = trades[0]!;
    expect(t1.direction).toBe("LONG");
    expect(parseFloat(t1.netPnl)).toBeGreaterThan(0);
  });

  it("extracts correct PnL for losing trade", () => {
    const { trades } = parseTradesCSV(SAMPLE_CSV);
    const t2 = trades[1]!;
    expect(parseFloat(t2.netPnl)).toBeLessThan(0);
  });

  it("parses semicolon-delimited EU CSV", () => {
    const { trades } = parseTradesCSV(SEMICOLON_CSV);
    expect(trades).toHaveLength(1);
    expect(parseFloat(trades[0]!.entryPrice)).toBeCloseTo(100.5, 1);
  });

  it("warns on open trades (entry with no exit)", () => {
    const csv = `Trade #,Type,Signal,Date/Time,Price,Contracts,Profit,Cum. Profit,Commission
1,Entry Long,Order,2024-01-02 09:30,100.50,10,,0,5.00`;
    const { trades, warnings } = parseTradesCSV(csv);
    expect(trades).toHaveLength(0); // open trade not included
    expect(warnings.some((w) => w.code === "OPEN_TRADE")).toBe(true);
  });

  it("returns empty array for empty CSV", () => {
    const { trades } = parseTradesCSV("");
    expect(trades).toHaveLength(0);
  });

  it("returns parser version", () => {
    const { parserVersion } = parseTradesCSV(SAMPLE_CSV);
    expect(parserVersion).toBe("1.0.0");
  });
});
