/**
 * @arf-os/backtest-sdk — runner interface and capability matrix.
 *
 * Milestone 1: runner interface + TRADINGVIEW_CSV adapter stub.
 * A Pine-compatible local runner is a later milestone.
 *
 * Key rules from CLAUDE.md §13:
 * - The runner implements BacktestRunner.
 * - Every result contains runner name/version, code hash, manifest hash,
 *   dataset hash, environment hash, parameters, trades (or enough data
 *   to reconstruct equity), warnings, timing, error details.
 * - Do not normalise away runner-specific warnings.
 */

// ── Branded ID types ──────────────────────────────────────────────────────────

export type BacktestRunId = string & { readonly __brand: "BacktestRunId" };
export type StrategyVersionId = string & { readonly __brand: "StrategyVersionId" };

// ── Runner capabilities ───────────────────────────────────────────────────────

export interface RunnerCapabilities {
  runnerName: string;
  runnerVersion: string;
  /** Maximum supported Pine version, e.g. "6". */
  maxPineVersion: string;
  supportsLocalCompile: boolean;
  supportsParameterSweep: boolean;
  supportsSegmentedBacktest: boolean;
  /** Whether the runner can produce a trade ledger with full OHLCV fills. */
  producesFullTradeLedger: boolean;
}

// ── Compile ───────────────────────────────────────────────────────────────────

export interface CompileInput {
  source: string;
  pineVersion?: string;
}

export interface CompileResult {
  ok: boolean;
  codeHash: string;
  errors: string[];
  warnings: string[];
  compiledAt: string;
}

// ── Backtest ──────────────────────────────────────────────────────────────────

export interface BacktestParameters {
  [key: string]: string | number | boolean;
}

export interface CostModel {
  commissionType: "percent" | "per_trade" | "per_share";
  commissionValue: number;
  slippageTicks: number;
}

export interface BacktestInput {
  runId: BacktestRunId;
  strategyVersionId: StrategyVersionId;
  source: string;
  manifest: Record<string, unknown>;
  symbol: string;
  timeframe: string;
  dateFrom?: string;
  dateTo?: string;
  initialCapital?: number;
  currency?: string;
  parameters?: BacktestParameters;
  costModel?: CostModel;
}

export interface BacktestTrade {
  tradeNumber: number;
  direction: "LONG" | "SHORT";
  entryTime: string;
  exitTime: string;
  entryPrice: string;
  exitPrice: string;
  quantity: string;
  grossPnl: string;
  commission: string;
  netPnl: string;
  entryReason?: string;
  exitReason?: string;
}

export interface BacktestResult {
  runId: BacktestRunId;
  runnerName: string;
  runnerVersion: string;
  codeHash: string;
  manifestHash: string;
  environmentHash: string;
  status: "SUCCEEDED" | "FAILED" | "CANCELLED";
  trades: BacktestTrade[];
  warnings: string[];
  errorCode?: string;
  errorMessage?: string;
  startedAt: string;
  completedAt: string;
}

// ── Runner interface ──────────────────────────────────────────────────────────

export interface BacktestRunner {
  capabilities(): RunnerCapabilities;
  compile(input: CompileInput): Promise<CompileResult>;
  run(input: BacktestInput): Promise<BacktestResult>;
  cancel(runId: BacktestRunId): Promise<void>;
}

// ── TradingView CSV stub runner ───────────────────────────────────────────────

/**
 * TradingViewCsvRunner is NOT a real backtest runner.
 * It parses uploaded CSV exports and returns a BacktestResult equivalent.
 * The actual parsing is done in packages/pine; this satisfies the BacktestRunner
 * interface so that the analytics worker can treat CSV ingestion uniformly.
 */
export class TradingViewCsvRunner implements BacktestRunner {
  capabilities(): RunnerCapabilities {
    return {
      runnerName: "TRADINGVIEW_CSV",
      runnerVersion: "1.0.0",
      maxPineVersion: "6",
      supportsLocalCompile: false,
      supportsParameterSweep: false,
      supportsSegmentedBacktest: false,
      producesFullTradeLedger: true,
    };
  }

  async compile(_input: CompileInput): Promise<CompileResult> {
    return {
      ok: false,
      codeHash: "",
      errors: ["TradingViewCsvRunner does not support local compilation"],
      warnings: [],
      compiledAt: new Date().toISOString(),
    };
  }

  async run(_input: BacktestInput): Promise<BacktestResult> {
    throw new Error(
      "TradingViewCsvRunner.run() is not callable directly. " +
        "Use the report-upload + parse-report job pipeline instead.",
    );
  }

  async cancel(_runId: BacktestRunId): Promise<void> {
    // no-op for CSV runner
  }
}
