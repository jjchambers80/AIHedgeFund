/**
 * Request/response shapes for the API layer.
 * Keeps route handlers thin — they validate against these, then call services.
 */
import { z } from "zod";

// ── Campaigns ─────────────────────────────────────────────────────────────────

export const CreateCampaignRequestSchema = z.object({
  title: z.string().min(1).max(200),
  objective: z.string().min(1),
  markets: z.array(z.string()).default([]),
  symbols: z.array(z.string()).default([]),
  timeframes: z.array(z.string()).default([]),
  strategyFamilies: z.array(z.string()).default([]),
  constraints: z.array(z.string()).default([]),
  modelBudgetUsd: z.string().nullable().default(null),
  computeRunsLimit: z.number().int().nullable().default(null),
});
export type CreateCampaignRequest = z.infer<typeof CreateCampaignRequestSchema>;

// ── Strategies ────────────────────────────────────────────────────────────────

export const CreateStrategyRequestSchema = z.object({
  campaignId: z.string().nullable().optional(),
  name: z.string().min(1).max(200),
  family: z.string(),
});
export type CreateStrategyRequest = z.infer<typeof CreateStrategyRequestSchema>;

export const CreateStrategyVersionRequestSchema = z.object({
  parentVersionId: z.string().nullable().optional(),
  changeReason: z.string().nullable().optional(),
});
export type CreateStrategyVersionRequest = z.infer<typeof CreateStrategyVersionRequestSchema>;

export const UploadSDLRequestSchema = z.object({
  definition: z.record(z.unknown()), // validated fully in the service layer
});

export const UploadPineRequestSchema = z.object({
  source: z.string().min(1),
  manifest: z.record(z.unknown()),
});

export type UploadSDLRequest = z.infer<typeof UploadSDLRequestSchema>;
export type UploadPineRequest = z.infer<typeof UploadPineRequestSchema>;

// ── TradingView Verification ──────────────────────────────────────────────────

export const CreateVerificationRequestSchema = z.object({
  strategyVersionId: z.string(),
  pineRevisionId: z.string(),
  symbol: z.string().min(1),
  timeframe: z.string().min(1),
  dateFrom: z.string().date().nullable().optional(),
  dateTo: z.string().date().nullable().optional(),
});
export type CreateVerificationRequest = z.infer<typeof CreateVerificationRequestSchema>;

export const CompleteUploadRequestSchema = z.object({
  reportType: z.enum(["PERFORMANCE_SUMMARY", "LIST_OF_TRADES"]),
  checksumSha256: z.string().length(64),
  fileSizeBytes: z.number().int().positive(),
});
export type CompleteUploadRequest = z.infer<typeof CompleteUploadRequestSchema>;

// ── Decisions ─────────────────────────────────────────────────────────────────

export const CreateDecisionRequestSchema = z.object({
  strategyVersionId: z.string(),
  decision: z.enum([
    "REJECT",
    "REWORK_WITH_NEW_VERSION",
    "PAPER_APPROVED",
    "RESEARCH_APPROVED",
    "INSUFFICIENT_EVIDENCE",
  ]),
  reasonCodes: z.array(z.string()).default([]),
  summary: z.string().min(1),
  conditions: z.array(z.string()).default([]),
  reviewDate: z.string().date().nullable().optional(),
  humanOverride: z.boolean().default(false),
  overrideReason: z.string().nullable().optional(),
});
export type CreateDecisionRequest = z.infer<typeof CreateDecisionRequestSchema>;

// ── Presigned upload response ─────────────────────────────────────────────────

export const PresignedUploadSchema = z.object({
  uploadId: z.string(),
  presignedUrl: z.string().url(),
  objectKey: z.string(),
  expiresAt: z.string().datetime(),
});
export type PresignedUpload = z.infer<typeof PresignedUploadSchema>;
