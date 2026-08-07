import { z } from "zod";
import { StrategyStatusSchema, ResearchStateSchema } from "./enums.js";

// ── Strategy Definition Language (SDL) ───────────────────────────────────────

export const ParameterSchema = z.object({
  key: z.string(),
  type: z.enum(["int", "float", "bool", "string"]),
  default: z.union([z.number(), z.boolean(), z.string()]),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  units: z.string().optional(),
  rationale: z.string().optional(),
});
export type Parameter = z.infer<typeof ParameterSchema>;

export const CostModelSchema = z.object({
  commissionType: z.enum(["percent", "per_share", "per_contract"]),
  commissionValue: z.number(),
  slippageTicks: z.number().int(),
});

export const StrategyDefinitionSchema = z.object({
  schemaVersion: z.string().default("1.0.0"),
  name: z.string(),
  family: z.string(),
  thesis: z.string(),
  directions: z.array(z.enum(["long", "short"])),
  market: z.object({
    assetClass: z.string(),
    symbols: z.array(z.string()),
    timeframe: z.string(),
    timezone: z.string(),
    session: z.string(),
    chartType: z.string().default("standard_ohlc"),
  }),
  execution: z.object({
    entryOrder: z.string(),
    pyramiding: z.number().int().default(0),
    allowReversal: z.boolean().default(false),
    processOnClose: z.boolean().default(false),
    calcOnEveryTick: z.boolean().default(false),
  }),
  risk: z.object({
    sizingModel: z.string(),
    sizePercent: z.number().optional(),
    leverage: z.number().default(1),
    stopLoss: z.object({ type: z.string(), valueParameter: z.string() }).optional(),
    takeProfit: z.object({ type: z.string(), valueParameter: z.string() }).optional(),
    oneStopOneTarget: z.boolean().default(true),
  }),
  costs: CostModelSchema,
  parameters: z.array(ParameterSchema),
  segments: z.object({
    warmupBars: z.number().int(),
    selectionMode: z.string(),
    embargoBars: z.number().int().default(0),
  }),
  falsification: z.array(z.string()),
});
export type StrategyDefinition = z.infer<typeof StrategyDefinitionSchema>;

// ── Strategy & StrategyVersion ────────────────────────────────────────────────

export const StrategySchema = z.object({
  id: z.string(),
  orgId: z.string(),
  campaignId: z.string().nullable(),
  name: z.string(),
  family: z.string(),
  status: StrategyStatusSchema,
  currentVersionId: z.string().nullable(),
  createdBy: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Strategy = z.infer<typeof StrategySchema>;

export const StrategyVersionSchema = z.object({
  id: z.string(),
  strategyId: z.string(),
  parentVersionId: z.string().nullable(),
  versionNumber: z.number().int(),
  status: StrategyStatusSchema,
  lifecycleState: ResearchStateSchema,
  definitionId: z.string().nullable(),
  pineRevisionId: z.string().nullable(),
  definitionHash: z.string().nullable(),
  pineSourceHash: z.string().nullable(),
  manifestHash: z.string().nullable(),
  changeReason: z.string().nullable(),
  createdBy: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type StrategyVersion = z.infer<typeof StrategyVersionSchema>;

export const CreateStrategyVersionSchema = z.object({
  strategyId: z.string(),
  parentVersionId: z.string().nullable(),
  changeReason: z.string().nullable(),
  definition: StrategyDefinitionSchema.optional(),
});
export type CreateStrategyVersion = z.infer<typeof CreateStrategyVersionSchema>;

// ── Pine Revision ─────────────────────────────────────────────────────────────

export const PineRevisionSchema = z.object({
  id: z.string(),
  strategyVersionId: z.string(),
  sourceHash: z.string(),
  manifestHash: z.string(),
  source: z.string(), // stored as text; large revisions go to object storage
  manifest: z.record(z.unknown()),
  pineVersion: z.string().default("6"),
  compileStatus: z.enum(["PENDING", "PASSED", "FAILED"]),
  staticChecksPassed: z.boolean().nullable(),
  staticWarnings: z.array(z.string()),
  staticErrors: z.array(z.string()),
  createdBy: z.string(),
  createdAt: z.string().datetime(),
});
export type PineRevision = z.infer<typeof PineRevisionSchema>;

// ── Strategy Lineage ──────────────────────────────────────────────────────────

export const StrategyLineageSchema = z.object({
  id: z.string(),
  strategyVersionId: z.string(),
  parentVersionId: z.string(),
  changeCategory: z.string(),
  changedFields: z.array(z.string()),
  evidenceIds: z.array(z.string()),
  contaminatedDatasetIds: z.array(z.string()),
  createdAt: z.string().datetime(),
});
export type StrategyLineage = z.infer<typeof StrategyLineageSchema>;
