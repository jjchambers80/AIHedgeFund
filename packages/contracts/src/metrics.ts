import { z } from "zod";
import { MetricScopeSchema } from "./enums.js";

export const MetricSnapshotSchema = z.object({
  id: z.string(),
  metricName: z.string(),
  value: z.string(),      // decimal as string — never float
  unit: z.string(),       // e.g. "USD", "percent", "count", "days"
  calculationVersion: z.string(), // semantic version of the calculation
  scopeType: MetricScopeSchema,
  scopeId: z.string(),    // ID of the run/version/etc this belongs to
  computedAt: z.string().datetime(),
});
export type MetricSnapshot = z.infer<typeof MetricSnapshotSchema>;

/** All metric names we compute independently. */
export const METRIC_NAMES = [
  "trade_count",
  "gross_profit",
  "gross_loss",
  "net_profit",
  "profit_factor",
  "win_rate",
  "avg_win",
  "avg_loss",
  "payoff_ratio",
  "max_drawdown_abs",
  "max_drawdown_pct",
  "longest_losing_streak",
  "avg_holding_duration_hours",
  "total_commission",
] as const;
export type MetricName = (typeof METRIC_NAMES)[number];
