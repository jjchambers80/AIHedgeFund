/**
 * worker-analytics — metrics, equity reconstruction, and parity jobs.
 *
 * Processes completed backtest runs by:
 * 1. Computing independent trade metrics (packages/metrics).
 * 2. Reconstructing equity and drawdown curves.
 * 3. Running parity checks against TradingView-reported values.
 * 4. Writing metric_snapshots, equity_points, drawdown_points, parity_reports to PostgreSQL.
 *
 * Architecture rules (CLAUDE.md §3.2, §14):
 * - Workers do NOT directly change strategy lifecycle state.
 * - All metric calculations are independent of TradingView-reported values.
 * - Parity check is SEPARATE from independently computed metrics.
 * - Every job is idempotent and restart-safe.
 */

import { logger } from "@arf-os/observability";

const SERVICE_NAME = "worker-analytics";
const VERSION = "0.1.0";

logger.info({ service: SERVICE_NAME, version: VERSION }, "worker-analytics starting");

// Graceful shutdown.
process.on("SIGTERM", () => {
  logger.info({ service: SERVICE_NAME }, "SIGTERM received — shutting down");
  process.exit(0);
});

process.on("SIGINT", () => {
  logger.info({ service: SERVICE_NAME }, "SIGINT received — shutting down");
  process.exit(0);
});
