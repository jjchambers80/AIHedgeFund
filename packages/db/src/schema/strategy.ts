import { pgTable, text, timestamp, integer, jsonb, boolean, index } from "drizzle-orm/pg-core";
import { organisations } from "./identity.js";
import { campaigns } from "./research.js";

export const strategies = pgTable(
  "strategies",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organisations.id),
    campaignId: text("campaign_id").references(() => campaigns.id),
    name: text("name").notNull(),
    family: text("family").notNull().default("unknown"),
    status: text("status").notNull().default("DRAFT"),
    currentVersionId: text("current_version_id"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("strategies_org_id_idx").on(t.orgId)],
);

export const strategyVersions = pgTable(
  "strategy_versions",
  {
    id: text("id").primaryKey(),
    strategyId: text("strategy_id")
      .notNull()
      .references(() => strategies.id),
    parentVersionId: text("parent_version_id"), // self-reference, no FK to avoid circular
    versionNumber: integer("version_number").notNull().default(1),
    status: text("status").notNull().default("DRAFT"),
    lifecycleState: text("lifecycle_state").notNull().default("CAMPAIGN_BACKLOG"),
    definitionId: text("definition_id"),
    pineRevisionId: text("pine_revision_id"),
    definitionHash: text("definition_hash"),
    pineSourceHash: text("pine_source_hash"),
    manifestHash: text("manifest_hash"),
    changeReason: text("change_reason"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("strategy_versions_strategy_id_idx").on(t.strategyId)],
);

export const strategyDefinitions = pgTable("strategy_definitions", {
  id: text("id").primaryKey(),
  strategyVersionId: text("strategy_version_id")
    .notNull()
    .references(() => strategyVersions.id),
  schemaVersion: text("schema_version").notNull().default("1.0.0"),
  definition: jsonb("definition").notNull(), // full SDL JSON
  definitionHash: text("definition_hash").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pineRevisions = pgTable("pine_revisions", {
  id: text("id").primaryKey(),
  strategyVersionId: text("strategy_version_id")
    .notNull()
    .references(() => strategyVersions.id),
  sourceHash: text("source_hash").notNull(),
  manifestHash: text("manifest_hash").notNull(),
  source: text("source").notNull(), // full Pine source
  manifest: jsonb("manifest").notNull(),
  pineVersion: text("pine_version").notNull().default("6"),
  compileStatus: text("compile_status").notNull().default("PENDING"),
  staticChecksPassed: boolean("static_checks_passed"),
  staticWarnings: jsonb("static_warnings").notNull().default([]),
  staticErrors: jsonb("static_errors").notNull().default([]),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const strategyLineage = pgTable("strategy_lineage", {
  id: text("id").primaryKey(),
  strategyVersionId: text("strategy_version_id")
    .notNull()
    .references(() => strategyVersions.id),
  parentVersionId: text("parent_version_id").notNull(),
  changeCategory: text("change_category").notNull(),
  changedFields: jsonb("changed_fields").notNull().default([]),
  evidenceIds: jsonb("evidence_ids").notNull().default([]),
  contaminatedDatasetIds: jsonb("contaminated_dataset_ids").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const artefacts = pgTable("artefacts", {
  id: text("id").primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => organisations.id),
  strategyVersionId: text("strategy_version_id").references(() => strategyVersions.id),
  artefactType: text("artefact_type").notNull(), // e.g. "pine_source", "tv_report_raw"
  objectKey: text("object_key").notNull(),
  checksumSha256: text("checksum_sha256").notNull(),
  fileSizeBytes: integer("file_size_bytes"),
  contentType: text("content_type"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
