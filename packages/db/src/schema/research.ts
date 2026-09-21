import { pgTable, text, timestamp, integer, jsonb, numeric } from "drizzle-orm/pg-core";
import { organisations } from "./identity.js";

export const campaigns = pgTable("campaigns", {
  id: text("id").primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => organisations.id),
  title: text("title").notNull(),
  objective: text("objective").notNull(),
  markets: jsonb("markets").notNull().default([]),
  symbols: jsonb("symbols").notNull().default([]),
  timeframes: jsonb("timeframes").notNull().default([]),
  strategyFamilies: jsonb("strategy_families").notNull().default([]),
  constraints: jsonb("constraints").notNull().default([]),
  status: text("status").notNull().default("CAMPAIGN_BACKLOG"),
  modelBudgetUsd: numeric("model_budget_usd", { precision: 20, scale: 2 }),
  computeRunsLimit: integer("compute_runs_limit"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const researchTasks = pgTable("research_tasks", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id")
    .notNull()
    .references(() => campaigns.id),
  strategyId: text("strategy_id"),
  strategyVersionId: text("strategy_version_id"),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  state: text("state").notNull().default("CAMPAIGN_BACKLOG"),
  assignedRole: text("assigned_role"),
  blockedReason: text("blocked_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
