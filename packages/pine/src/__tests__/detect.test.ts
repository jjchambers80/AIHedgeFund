import { describe, it, expect } from "vitest";
import { detectDelimiter, detectDecimalSeparator, normaliseNumber } from "../csv/detect.js";

describe("detectDecimalSeparator", () => {
  it("never misdetects EU decimals in a comma-delimited file, even when a timestamp sits next to a price", () => {
    // Regression: "09:30,100.00" previously matched the EU thousands pattern
    // ("30,100") purely from the field delimiter, corrupting every price in
    // otherwise-plain US-locale exports.
    const csv = "Time,Price\n09:30,100.00\n15:30,105.00\n";
    const delimiter = detectDelimiter(csv);
    expect(delimiter).toBe(",");
    expect(detectDecimalSeparator(csv, delimiter)).toBe(".");
    expect(normaliseNumber("100.00", detectDecimalSeparator(csv, delimiter))).toBe("100.00");
  });

  it("still detects EU decimals in a semicolon-delimited file", () => {
    const csv = "Time;Price\n09:30;100,50\n";
    const delimiter = detectDelimiter(csv);
    expect(delimiter).toBe(";");
    expect(detectDecimalSeparator(csv, delimiter)).toBe(",");
  });
});
