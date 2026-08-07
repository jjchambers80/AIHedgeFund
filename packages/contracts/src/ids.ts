/**
 * Branded domain ID types.
 * Using string & { readonly __brand } prevents accidentally passing the wrong ID across boundaries.
 */

export type OrgId = string & { readonly __brand: "OrgId" };
export type UserId = string & { readonly __brand: "UserId" };
export type MembershipId = string & { readonly __brand: "MembershipId" };
export type CampaignId = string & { readonly __brand: "CampaignId" };
export type ResearchTaskId = string & { readonly __brand: "ResearchTaskId" };
export type StrategyId = string & { readonly __brand: "StrategyId" };
export type StrategyVersionId = string & { readonly __brand: "StrategyVersionId" };
export type StrategyDefinitionId = string & { readonly __brand: "StrategyDefinitionId" };
export type PineRevisionId = string & { readonly __brand: "PineRevisionId" };
export type ArtefactId = string & { readonly __brand: "ArtefactId" };
export type BacktestRunId = string & { readonly __brand: "BacktestRunId" };
export type TradeId = string & { readonly __brand: "TradeId" };
export type MetricSnapshotId = string & { readonly __brand: "MetricSnapshotId" };
export type TradingViewVerificationId = string & {
  readonly __brand: "TradingViewVerificationId";
};
export type ReportUploadId = string & { readonly __brand: "ReportUploadId" };
export type CommitteeDecisionId = string & { readonly __brand: "CommitteeDecisionId" };
export type AuditEventId = string & { readonly __brand: "AuditEventId" };
export type OutboxEventId = string & { readonly __brand: "OutboxEventId" };
export type IdempotencyRecordId = string & { readonly __brand: "IdempotencyRecordId" };
export type AgentRunId = string & { readonly __brand: "AgentRunId" };
export type HandoffId = string & { readonly __brand: "HandoffId" };
export type PolicyVersionId = string & { readonly __brand: "PolicyVersionId" };

/** Cast a raw string to a branded ID — only use at trust boundaries (DB reads, API inputs). */
export function asId<T extends string>(raw: string): T {
  return raw as T;
}
