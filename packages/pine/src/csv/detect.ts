/**
 * Detect CSV delimiter and locale hints from the raw file content.
 * TradingView exports may use comma or semicolon delimiters depending on
 * the user's locale settings.
 */

export type Delimiter = "," | ";";

export function detectDelimiter(raw: string): Delimiter {
  const sample = raw.slice(0, 2000);
  const commas = (sample.match(/,/g) ?? []).length;
  const semis = (sample.match(/;/g) ?? []).length;
  return semis > commas ? ";" : ",";
}

/**
 * Detect if numbers use comma as decimal separator (European locale).
 * We look for patterns like "1.234,56" vs "1,234.56".
 *
 * When the field delimiter itself is a comma, the comma can't also be the
 * decimal separator (that would be ambiguous, invalid CSV) — a naive scan
 * of the raw text would false-positive on ordinary delimiter-adjacent
 * digits (e.g. a "09:30,100.00" timestamp-then-price pair matches the EU
 * thousands pattern "30,100" even though this is a plain US-locale file).
 * So EU detection only runs for non-comma delimiters.
 */
export function detectDecimalSeparator(raw: string, delimiter: Delimiter = ","): "." | "," {
  if (delimiter === ",") return ".";
  // European pattern: digits comma digits (no trailing digits after dot for thousands)
  const euroPattern = /\d{1,3}(\.\d{3})*,\d+/;
  return euroPattern.test(raw) ? "," : ".";
}

/**
 * Normalise a number string to a standard decimal string.
 * Handles both "1,234.56" (US) and "1.234,56" (EU) formats.
 */
export function normaliseNumber(raw: string, decimalSep: "." | ","): string {
  const cleaned = raw.trim().replace(/\s/g, "");
  if (decimalSep === ",") {
    // EU: remove dot (thousands) then replace comma with dot
    return cleaned.replace(/\./g, "").replace(",", ".");
  }
  // US: remove comma (thousands)
  return cleaned.replace(/,/g, "");
}
