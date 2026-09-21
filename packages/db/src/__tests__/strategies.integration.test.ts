/**
 * Integration tests: strategies, strategy_versions, strategy_lineage
 * Verifies immutable versioning, lineage tracking, and org isolation.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, closeDb } from "../client.js";
import { strategies, strategyVersions, strategyLineage } from "../schema/index.js";
import {
  makeId,
  createOrg,
  createUser,
  createCampaign,
  createStrategy,
  createStrategyVersion,
  cleanup,
} from "./helpers.js";

let orgId: string;
let org2Id: string;
let userId: string;
let campaignId: string;
let strategyId: string;
let version1Id: string;
let version2Id: string;

beforeAll(async () => {
  const org = await createOrg({ name: "Strategy Test Org" });
  const org2 = await createOrg({ name: "Strategy Test Org 2" });
  orgId = org.id;
  org2Id = org2.id;
  const user = await createUser(orgId);
  userId = user.id;
  const campaign = await createCampaign(orgId, userId);
  campaignId = campaign.id;
});

afterAll(async () => {
  const db = getDb();
  // Delete lineage first (no helper, do inline)
  if (version2Id) {
    await db
      .delete(strategyLineage)
      .where(eq(strategyLineage.strategyVersionId, version2Id));
  }
  await cleanup({
    strategyVersionIds: [version1Id, version2Id].filter(Boolean),
    strategyIds: [strategyId].filter(Boolean),
    campaignIds: [campaignId],
    userIds: [userId],
    orgIds: [orgId, org2Id],
  });
  await closeDb();
});

describe("strategies", () => {
  it("creates a strategy scoped to org and campaign", async () => {
    const s = await createStrategy(orgId, userId, campaignId, { name: "RSI Reversal" });
    strategyId = s.id;
    expect(s.orgId).toBe(orgId);
    expect(s.campaignId).toBe(campaignId);
    expect(s.name).toBe("RSI Reversal");
    expect(s.status).toBe("DRAFT");
  });

  it("reads strategy by org scope", async () => {
    const db = getDb();
    const rows = await db
      .select()
      .from(strategies)
      .where(eq(strategies.orgId, orgId));
    expect(rows.some((s) => s.id === strategyId)).toBe(true);
  });

  it("does not expose other org's strategies", async () => {
    const otherUser = await createUser(org2Id);
    const otherStrategy = await createStrategy(org2Id, otherUser.id);
    const db = getDb();
    const rows = await db
      .select()
      .from(strategies)
      .where(eq(strategies.orgId, orgId));
    expect(rows.some((s) => s.id === otherStrategy.id)).toBe(false);
    // Cleanup in FK order
    await db.delete(strategies).where(eq(strategies.id, otherStrategy.id));
    const { users: usersTable } = await import("../schema/index.js");
    await db.delete(usersTable).where(eq(usersTable.id, otherUser.id));
  });

  it("rejects strategy with non-existent org", async () => {
    const db = getDb();
    await expect(
      db.insert(strategies).values({
        id: makeId(),
        orgId: "ghost-org",
        name: "Bad Strategy",
        family: "unknown",
        createdBy: userId,
      }),
    ).rejects.toThrow();
  });
});

describe("strategy_versions", () => {
  it("creates version 1 for a strategy", async () => {
    const v = await createStrategyVersion(strategyId, userId, {
      lifecycleState: "CAMPAIGN_BACKLOG",
      versionNumber: 1,
    });
    version1Id = v.id;
    expect(v.strategyId).toBe(strategyId);
    expect(v.versionNumber).toBe(1);
    expect(v.lifecycleState).toBe("CAMPAIGN_BACKLOG");
    expect(v.status).toBe("DRAFT");
  });

  it("creates version 2 with parent reference", async () => {
    const db = getDb();
    const id = makeId();
    const [v2] = await db
      .insert(strategyVersions)
      .values({
        id,
        strategyId,
        parentVersionId: version1Id,
        versionNumber: 2,
        status: "DRAFT",
        lifecycleState: "IDEA_RESEARCH",
        changeReason: "Updated Pine source",
        createdBy: userId,
      })
      .returning();
    version2Id = v2!.id;
    expect(v2!.parentVersionId).toBe(version1Id);
    expect(v2!.versionNumber).toBe(2);
  });

  it("reads all versions for a strategy in order", async () => {
    const db = getDb();
    const rows = await db
      .select()
      .from(strategyVersions)
      .where(eq(strategyVersions.strategyId, strategyId));
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const nums = rows.map((r) => r.versionNumber).sort();
    expect(nums[0]).toBe(1);
    expect(nums[1]).toBe(2);
  });

  it("version is not deleted when queried — immutability check", async () => {
    // Verify v1 still exists after v2 was created (no cascade overwrite)
    const db = getDb();
    const [v1] = await db
      .select()
      .from(strategyVersions)
      .where(eq(strategyVersions.id, version1Id));
    expect(v1).toBeDefined();
    expect(v1!.versionNumber).toBe(1);
  });

  it("rejects version with non-existent strategy FK", async () => {
    const db = getDb();
    await expect(
      db.insert(strategyVersions).values({
        id: makeId(),
        strategyId: "ghost-strategy",
        versionNumber: 1,
        status: "DRAFT",
        lifecycleState: "CAMPAIGN_BACKLOG",
        createdBy: userId,
      }),
    ).rejects.toThrow();
  });
});

describe("strategy_lineage", () => {
  it("records lineage: child version points to parent", async () => {
    const db = getDb();
    const lineageId = makeId();
    // strategyVersionId = the child (new) version; parentVersionId = the old version
    const [row] = await db
      .insert(strategyLineage)
      .values({
        id: lineageId,
        strategyVersionId: version2Id,
        parentVersionId: version1Id,
        changeCategory: "PINE_UPDATE",
        changedFields: ["pineSourceHash"] as unknown as never,
      })
      .returning();
    expect(row!.strategyVersionId).toBe(version2Id);
    expect(row!.parentVersionId).toBe(version1Id);
    expect(row!.changeCategory).toBe("PINE_UPDATE");
    expect(row!.changedFields).toEqual(["pineSourceHash"]);
  });

  it("rejects lineage with non-existent strategy version FK", async () => {
    const db = getDb();
    await expect(
      db.insert(strategyLineage).values({
        id: makeId(),
        strategyVersionId: "ghost-version",
        parentVersionId: version1Id,
        changeCategory: "PINE_UPDATE",
      }),
    ).rejects.toThrow();
  });
});
