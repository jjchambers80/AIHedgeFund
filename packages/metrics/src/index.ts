export { computeTradeMetrics, CALCULATION_VERSION } from "./calculations.js";
export type { TradeMetrics, MonthlyReturn } from "./calculations.js";
export { reconstructEquity, computeDrawdown } from "./equity.js";
export type { EquityPoint, DrawdownPoint } from "./equity.js";
export { computeParityReport, findFirstTradeDivergence } from "./parity.js";
export type { ParityCheckResult, ParityStatus, FirstTradeDivergence, DivergenceTradeInput } from "./parity.js";
