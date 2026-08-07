import { z } from "zod";
import { ResearchStateSchema } from "./enums.js";

export const CampaignSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  title: z.string().min(1).max(200),
  objective: z.string().min(1),
  markets: z.array(z.string()),
  symbols: z.array(z.string()),
  timeframes: z.array(z.string()),
  strategyFamilies: z.array(z.string()),
  constraints: z.array(z.string()),
  status: ResearchStateSchema,
  modelBudgetUsd: z.string().nullable(), // decimal as string
  computeRunsLimit: z.number().int().nullable(),
  createdBy: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Campaign = z.infer<typeof CampaignSchema>;

export const CreateCampaignSchema = CampaignSchema.omit({
  id: true,
  status: true,
  createdAt: true,
  updatedAt: true,
});
export type CreateCampaign = z.infer<typeof CreateCampaignSchema>;

export const ResearchTaskSchema = z.object({
  id: z.string(),
  campaignId: z.string(),
  strategyId: z.string().nullable(),
  strategyVersionId: z.string().nullable(),
  title: z.string(),
  description: z.string(),
  state: ResearchStateSchema,
  assignedRole: z.string().nullable(),
  blockedReason: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ResearchTask = z.infer<typeof ResearchTaskSchema>;
