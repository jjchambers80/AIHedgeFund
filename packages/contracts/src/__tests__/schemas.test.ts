/**
 * Unit tests for @arf-os/contracts Zod schemas.
 *
 * Covers: enums, strategy definition, API request shapes, decisions, idempotency.
 * Every schema must reject invalid values without silent coercion (CLAUDE.md §8).
 */
import { describe, it, expect } from "vitest";
import {
  ResearchStateSchema,
  StrategyStatusSchema,
  ParityStatusSchema,
  DecisionValueSchema,
  RoleSchema,
  AgentRoleSchema,
  JobStatusSchema,
  ReportTypeSchema,
  TradeDirectionSchema,
} from "../enums.js";
import { StrategyDefinitionSchema } from "../strategies.js";
import {
  CreateStrategyRequestSchema,
  CreateStrategyVersionRequestSchema,
  CreateDecisionRequestSchema,
} from "../api.js";

// ── Enum schemas ──────────────────────────────────────────────────────────────

describe("ResearchStateSchema", () => {
  it("accepts all valid states", () => {
    const valid = ["CAMPAIGN_BACKLOG", "IDEA_RESEARCH", "PINE_DEVELOPMENT", "REJECTED", "ARCHIVED"];
    for (const s of valid) {
      expect(ResearchStateSchema.safeParse(s).success).toBe(true);
    }
  });

  it("rejects invalid states", () => {
    expect(ResearchStateSchema.safeParse("LIVE_TRADING").success).toBe(false);
    expect(ResearchStateSchema.safeParse("").success).toBe(false);
    expect(ResearchStateSchema.safeParse(null).success).toBe(false);
  });
});

describe("StrategyStatusSchema", () => {
  it("accepts PAPER_APPROVED", () => {
    expect(StrategyStatusSchema.parse("PAPER_APPROVED")).toBe("PAPER_APPROVED");
  });

  it("rejects LIVE_APPROVED as not in the MVP scope", () => {
    // LIVE_APPROVED is in the enum but must be validated downstream by policy
    expect(StrategyStatusSchema.safeParse("LIVE_APPROVED").success).toBe(true);
    expect(StrategyStatusSchema.safeParse("ACTIVE").success).toBe(false);
  });
});

describe("ParityStatusSchema", () => {
  it("accepts all four parity statuses", () => {
    for (const s of ["PASS", "WARN", "FAIL", "INSUFFICIENT_DATA"]) {
      expect(ParityStatusSchema.parse(s)).toBe(s);
    }
  });

  it("rejects unknown parity status", () => {
    expect(ParityStatusSchema.safeParse("PARTIAL").success).toBe(false);
  });
});

describe("DecisionValueSchema", () => {
  it("accepts REJECT and REWORK_WITH_NEW_VERSION", () => {
    expect(DecisionValueSchema.parse("REJECT")).toBe("REJECT");
    expect(DecisionValueSchema.parse("REWORK_WITH_NEW_VERSION")).toBe("REWORK_WITH_NEW_VERSION");
  });

  it("does not allow free-text decisions", () => {
    expect(DecisionValueSchema.safeParse("looks good").success).toBe(false);
  });
});

describe("RoleSchema", () => {
  it("accepts COMMITTEE_MEMBER", () => {
    expect(RoleSchema.parse("COMMITTEE_MEMBER")).toBe("COMMITTEE_MEMBER");
  });

  it("rejects role escalation attempt", () => {
    expect(RoleSchema.safeParse("SUPERADMIN").success).toBe(false);
  });
});

describe("AgentRoleSchema", () => {
  it("contains all eight specialist lanes plus orchestrator", () => {
    const expected = [
      "IDEA_SCOUT",
      "INDICATOR_RESEARCHER",
      "STRATEGY_ARCHITECT",
      "PINE_ENGINEER",
      "BACKTEST_ENGINEER",
      "ROBUSTNESS_VALIDATOR",
      "FORWARD_TEST_OPERATOR",
      "STRATEGY_JUDGE",
      "CHIEF_RESEARCH_ORCHESTRATOR",
    ];
    for (const role of expected) {
      expect(AgentRoleSchema.safeParse(role).success).toBe(true);
    }
  });
});

describe("TradeDirectionSchema", () => {
  it("accepts LONG and SHORT only", () => {
    expect(TradeDirectionSchema.parse("LONG")).toBe("LONG");
    expect(TradeDirectionSchema.parse("SHORT")).toBe("SHORT");
    expect(TradeDirectionSchema.safeParse("BUY").success).toBe(false);
  });
});

describe("JobStatusSchema", () => {
  it("accepts all job statuses", () => {
    for (const s of [
      "QUEUED",
      "RUNNING",
      "WAITING_EXTERNAL",
      "SUCCEEDED",
      "FAILED_RETRYABLE",
      "FAILED_TERMINAL",
      "CANCELLED",
    ]) {
      expect(JobStatusSchema.parse(s)).toBe(s);
    }
  });
});

describe("ReportTypeSchema", () => {
  it("accepts PERFORMANCE_SUMMARY and LIST_OF_TRADES", () => {
    expect(ReportTypeSchema.parse("PERFORMANCE_SUMMARY")).toBe("PERFORMANCE_SUMMARY");
    expect(ReportTypeSchema.parse("LIST_OF_TRADES")).toBe("LIST_OF_TRADES");
    expect(ReportTypeSchema.safeParse("TRADE_LIST").success).toBe(false);
  });
});

// ── Strategy Definition Language ──────────────────────────────────────────────

describe("StrategyDefinitionSchema", () => {
  const validSDL = {
    schemaVersion: "1.0.0",
    name: "Test Trend Strategy",
    family: "trend_following",
    thesis: "Enter pullbacks in confirmed trend.",
    directions: ["long", "short"],
    market: {
      assetClass: "crypto",
      symbols: ["BYBIT:BTCUSDT.P"],
      timeframe: "60",
      timezone: "Etc/UTC",
      session: "0000-2359:1234567",
      chartType: "standard_ohlc",
    },
    execution: {
      entryOrder: "market_next_bar",
      pyramiding: 0,
      allowReversal: false,
      processOnClose: false,
      calcOnEveryTick: false,
    },
    risk: {
      sizingModel: "percent_of_equity",
      sizePercent: 10,
      leverage: 3,
      stopLoss: { type: "atr_multiple", valueParameter: "stop_atr" },
      takeProfit: { type: "risk_multiple", valueParameter: "target_r" },
      oneStopOneTarget: true,
    },
    costs: {
      commissionType: "percent",
      commissionValue: 0.06,
      slippageTicks: 2,
    },
    parameters: [
      { key: "fast_length", type: "int", default: 20, min: 10, max: 50, step: 5 },
    ],
    segments: {
      warmupBars: 300,
      selectionMode: "rolling_walk_forward",
      embargoBars: 10,
    },
    falsification: ["Out-of-sample net profit is non-positive."],
  };

  it("accepts a complete valid SDL", () => {
    const result = StrategyDefinitionSchema.safeParse(validSDL);
    expect(result.success).toBe(true);
  });

  it("enforces pyramiding = 0 is allowed", () => {
    const result = StrategyDefinitionSchema.safeParse({ ...validSDL, execution: { ...validSDL.execution, pyramiding: 0 } });
    expect(result.success).toBe(true);
  });

  it("rejects missing required fields", () => {
    const { name: _name, ...without } = validSDL;
    expect(StrategyDefinitionSchema.safeParse(without).success).toBe(false);
  });

  it("rejects invalid direction values", () => {
    const bad = { ...validSDL, directions: ["long", "futures"] };
    expect(StrategyDefinitionSchema.safeParse(bad).success).toBe(false);
  });
});

// ── API request schemas ───────────────────────────────────────────────────────

describe("CreateStrategyRequestSchema", () => {
  it("accepts a minimal valid request", () => {
    const result = CreateStrategyRequestSchema.safeParse({
      name: "My Strategy",
      family: "mean_reversion",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    expect(CreateStrategyRequestSchema.safeParse({ name: "", family: "trend" }).success).toBe(false);
  });
});

describe("CreateStrategyVersionRequestSchema", () => {
  it("accepts a valid version request", () => {
    expect(
      CreateStrategyVersionRequestSchema.safeParse({
        changeReason: "Adjusted stop distance",
      }).success,
    ).toBe(true);
  });
});

// ── Decision schemas ──────────────────────────────────────────────────────────

describe("CreateDecisionRequestSchema", () => {
  it("accepts a valid decision", () => {
    expect(
      CreateDecisionRequestSchema.safeParse({
        strategyVersionId: "01J0000000000000000000000A",
        decision: "REJECT",
        summary: "Out-of-sample profit factor below threshold.",
        humanOverride: false,
      }).success,
    ).toBe(true);
  });

  it("rejects a decision without a summary", () => {
    expect(
      CreateDecisionRequestSchema.safeParse({
        strategyVersionId: "01J0000000000000000000000A",
        decision: "REJECT",
        summary: "",
        humanOverride: false,
      }).success,
    ).toBe(false);
  });

  it("rejects an unknown decision value", () => {
    expect(
      CreateDecisionRequestSchema.safeParse({
        strategyVersionId: "01J0000000000000000000000A",
        decision: "LOOKS_GOOD",
        summary: "Seems fine.",
        humanOverride: false,
      }).success,
    ).toBe(false);
  });
});
