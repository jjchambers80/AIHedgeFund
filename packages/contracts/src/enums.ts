import { z } from "zod";

// ── Research lifecycle states ──────────────────────────────────────────────────
export const ResearchStateSchema = z.enum([
  "CAMPAIGN_BACKLOG",
  "IDEA_RESEARCH",
  "HYPOTHESIS_DRAFT",
  "PINE_DEVELOPMENT",
  "TRADINGVIEW_VERIFICATION",
  "PAPER_APPROVAL_REVIEW",
  "PAPER_APPROVED",
  "FORWARD_TESTING",
  "FINAL_REVIEW",
  "RESEARCH_APPROVED",
  "LIVE_CANDIDATE",
  "REJECTED",
  "ARCHIVED",
  "BLOCKED",
]);
export type ResearchState = z.infer<typeof ResearchStateSchema>;

// ── Strategy approval levels ──────────────────────────────────────────────────
export const StrategyStatusSchema = z.enum([
  "DRAFT",
  "RESEARCH_APPROVED",
  "PAPER_APPROVED",
  "LIVE_CANDIDATE",
  "LIVE_APPROVED",
  "REJECTED",
  "ARCHIVED",
]);
export type StrategyStatus = z.infer<typeof StrategyStatusSchema>;

// ── Parity result ─────────────────────────────────────────────────────────────
export const ParityStatusSchema = z.enum(["PASS", "WARN", "FAIL", "INSUFFICIENT_DATA"]);
export type ParityStatus = z.infer<typeof ParityStatusSchema>;

// ── Evidence grade ────────────────────────────────────────────────────────────
export const EvidenceGradeSchema = z.enum(["A", "B", "C", "D", "F"]);
export type EvidenceGrade = z.infer<typeof EvidenceGradeSchema>;

// ── Committee decision values ─────────────────────────────────────────────────
export const DecisionValueSchema = z.enum([
  "REJECT",
  "REWORK_WITH_NEW_VERSION",
  "PAPER_APPROVED",
  "RESEARCH_APPROVED",
  "LIVE_CANDIDATE",
  "INSUFFICIENT_EVIDENCE",
]);
export type DecisionValue = z.infer<typeof DecisionValueSchema>;

// ── RBAC roles ────────────────────────────────────────────────────────────────
export const RoleSchema = z.enum([
  "VIEWER",
  "RESEARCHER",
  "DEVELOPER",
  "VALIDATOR",
  "OPERATOR",
  "COMMITTEE_MEMBER",
  "ADMIN",
  "SERVICE_ACCOUNT",
]);
export type Role = z.infer<typeof RoleSchema>;

// ── Agent roles ───────────────────────────────────────────────────────────────
export const AgentRoleSchema = z.enum([
  "IDEA_SCOUT",
  "INDICATOR_RESEARCHER",
  "STRATEGY_ARCHITECT",
  "PINE_ENGINEER",
  "BACKTEST_ENGINEER",
  "ROBUSTNESS_VALIDATOR",
  "FORWARD_TEST_OPERATOR",
  "STRATEGY_JUDGE",
  "DATA_INTEGRITY_ANALYST",
  "PORTFOLIO_RESEARCHER",
  "CHIEF_RESEARCH_ORCHESTRATOR",
]);
export type AgentRole = z.infer<typeof AgentRoleSchema>;

// ── Job status ────────────────────────────────────────────────────────────────
export const JobStatusSchema = z.enum([
  "QUEUED",
  "RUNNING",
  "WAITING_EXTERNAL",
  "SUCCEEDED",
  "FAILED_RETRYABLE",
  "FAILED_TERMINAL",
  "CANCELLED",
]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

// ── Report types ──────────────────────────────────────────────────────────────
export const ReportTypeSchema = z.enum(["PERFORMANCE_SUMMARY", "LIST_OF_TRADES"]);
export type ReportType = z.infer<typeof ReportTypeSchema>;

// ── Verification status ───────────────────────────────────────────────────────
export const VerificationStatusSchema = z.enum([
  "PENDING",
  "UPLOADS_RECEIVED",
  "PROCESSING",
  "COMPLETE",
  "FAILED",
]);
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;

// ── Trade direction ───────────────────────────────────────────────────────────
export const TradeDirectionSchema = z.enum(["LONG", "SHORT"]);
export type TradeDirection = z.infer<typeof TradeDirectionSchema>;

// ── Metric scope ──────────────────────────────────────────────────────────────
export const MetricScopeSchema = z.enum([
  "BACKTEST_RUN",
  "SEGMENT",
  "STRATEGY_VERSION",
  "FORWARD_DEPLOYMENT",
  "PORTFOLIO",
]);
export type MetricScope = z.infer<typeof MetricScopeSchema>;

// ── Audit actor types ─────────────────────────────────────────────────────────
export const AuditActorTypeSchema = z.enum(["USER", "AGENT", "SYSTEM", "SERVICE_ACCOUNT"]);
export type AuditActorType = z.infer<typeof AuditActorTypeSchema>;
