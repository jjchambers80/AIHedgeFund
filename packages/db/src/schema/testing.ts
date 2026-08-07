import { pgTable, text, timestamp, integer, jsonb, numeric, index } from "drizzle-orm/pg-core";
import { strategyVersions, pineRevisions } from "./strategy.js";

export const tradingViewVerifications = pgTable(
  "tradingview_verifications",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    strategyVersionId: text("strategy_version_id")
      .notNull()
      .references(() => strategyVersions.id),
    pineRevisionId: text("pine_revision_id")
      .notNull()
      .references(() => pineRevisions.id),
    symbol: text("symbol").notNull(),
    timeframe: text("timeframe").notNull(),
    dateFrom: text("date_from"),
    dateTo: text("date_to"),
    status: text("status").notNull().default("PENDING"),
    parityReportId: text("parity_report_id"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tv_verif_strategy_version_idx").on(t.strategyVersionId)],
);

export const reportUploads = pgTable("report_uploads", {
  id: text("id").primaryKey(),
  verificationId: text("verification_id")
    .notNull()
    .references(() => tradingViewVerifications.id),
  reportType: text("report_type").notNull(), // PERFORMANCE_SUMMARY | LIST_OF_TRADES
  objectKey: text("object_key").notNull(),
  checksumSha256: text("checksum_sha256").notNull(),
  fileSizeBytes: integer("file_size_bytes").notNull(),
  parserVersion: text("parser_version"),
  parseStatus: text("parse_status").notNull().default("QUEUED"),
  parseWarnings: jsonb("parse_warnings").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const backtestRuns = pgTable(
  "backtest_runs",
  {
    id: text("id").primaryKey(),
    strategyVersionId: text("strategy_version_id")
      .notNull()
      .references(() => strategyVersions.id),
    verificationId: text("verification_id").references(() => tradingViewVerifications.id),
    runnerType: text("runner_type").notNull().default("TRADINGVIEW_CSV"),
    runnerVersion: text("runner_version").notNull().default("1.0.0"),
    symbol: text("symbol").notNull(),
    timeframe: text("timeframe").notNull(),
    dateFrom: text("date_from"),
    dateTo: text("date_to"),
    initialCapital: numeric("initial_capital", { precision: 20, scale: 8 }).notNull().default("100000"),
    currency: text("currency").notNull().default("USD"),
    status: text("status").notNull().default("QUEUED"),
    tradeCount: integer("trade_count"),
    sourceHash: text("source_hash"),
    parameterSetId: text("parameter_set_id"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("backtest_runs_strategy_version_idx").on(t.strategyVersionId)],
);

export const trades = pgTable(
  "trades",
  {
    id: text("id").primaryKey(),
    backtestRunId: text("backtest_run_id")
      .notNull()
      .references(() => backtestRuns.id),
    tradeNumber: integer("trade_number").notNull(),
    direction: text("direction").notNull(), // LONG | SHORT
    entryTime: timestamp("entry_time", { withTimezone: true }).notNull(),
    exitTime: timestamp("exit_time", { withTimezone: true }).notNull(),
    entryPrice: numeric("entry_price", { precision: 20, scale: 8 }).notNull(),
    exitPrice: numeric("exit_price", { precision: 20, scale: 8 }).notNull(),
    quantity: numeric("quantity", { precision: 20, scale: 8 }).notNull(),
    grossPnl: numeric("gross_pnl", { precision: 20, scale: 8 }).notNull(),
    commission: numeric("commission", { precision: 20, scale: 8 }).notNull().default("0"),
    netPnl: numeric("net_pnl", { precision: 20, scale: 8 }).notNull(),
    entryReason: text("entry_reason"),
    exitReason: text("exit_reason"),
    parityStatus: text("parity_status").notNull().default("UNVERIFIED"),
  },
  (t) => [index("trades_backtest_run_idx").on(t.backtestRunId)],
);

export const equityPoints = pgTable(
  "equity_points",
  {
    id: text("id").primaryKey(),
    backtestRunId: text("backtest_run_id")
      .notNull()
      .references(() => backtestRuns.id),
    tradeNumber: integer("trade_number").notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    equity: numeric("equity", { precision: 20, scale: 8 }).notNull(),
  },
  (t) => [index("equity_points_run_idx").on(t.backtestRunId)],
);

export const drawdownPoints = pgTable(
  "drawdown_points",
  {
    id: text("id").primaryKey(),
    backtestRunId: text("backtest_run_id")
      .notNull()
      .references(() => backtestRuns.id),
    tradeNumber: integer("trade_number").notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    drawdownAbs: numeric("drawdown_abs", { precision: 20, scale: 8 }).notNull(),
    drawdownPct: numeric("drawdown_pct", { precision: 10, scale: 8 }).notNull(),
  },
  (t) => [index("drawdown_points_run_idx").on(t.backtestRunId)],
);

export const metricSnapshots = pgTable(
  "metric_snapshots",
  {
    id: text("id").primaryKey(),
    metricName: text("metric_name").notNull(),
    value: numeric("value", { precision: 30, scale: 10 }).notNull(),
    unit: text("unit").notNull(),
    calculationVersion: text("calculation_version").notNull(),
    scopeType: text("scope_type").notNull(),
    scopeId: text("scope_id").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("metric_snapshots_scope_idx").on(t.scopeType, t.scopeId),
    index("metric_snapshots_name_idx").on(t.metricName),
  ],
);

export const parityReports = pgTable("parity_reports", {
  id: text("id").primaryKey(),
  verificationId: text("verification_id")
    .notNull()
    .references(() => tradingViewVerifications.id),
  backtestRunId: text("backtest_run_id")
    .notNull()
    .references(() => backtestRuns.id),
  status: text("status").notNull(), // PASS | WARN | FAIL | INSUFFICIENT_DATA
  tvTradeCount: integer("tv_trade_count"),
  arfTradeCount: integer("arf_trade_count"),
  tvNetProfit: numeric("tv_net_profit", { precision: 20, scale: 8 }),
  arfNetProfit: numeric("arf_net_profit", { precision: 20, scale: 8 }),
  tvMaxDrawdown: numeric("tv_max_drawdown", { precision: 20, scale: 8 }),
  arfMaxDrawdown: numeric("arf_max_drawdown", { precision: 20, scale: 8 }),
  firstTradeDivergence: text("first_trade_divergence"),
  warnings: jsonb("warnings").notNull().default([]),
  policyVersion: text("policy_version").notNull().default("1.0.0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
