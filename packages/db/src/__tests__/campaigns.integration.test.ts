/**
 * Integration tests: campaigns and research_tasks
 * Verifies campaign CRUD, org scoping, status transitions, and FK constraints.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, closeDb } from "../client.js";
import { campaigns } from "../schema/index.js";
import {
  makeId,
  createOrg,
  createUser,
  createCampaign,
  cleanup,
} from "./helpers.js";

let orgId: string;
let org2Id: string;
let userId: string;
let campaignId: string;
let campaign2Id: string;

beforeAll(async () => {
  const org = await createOrg({ name: "Campaign Test Org" });
  const org2 = await createOrg({ name: "Campaign Test Org 2" });
  orgId = org.id;
  org2Id = org2.id;
  const user = await createUser(orgId);
  userId = user.id;
});

afterAll(async () => {
  await cleanup({
    campaignIds: [campaignId, campaign2Id].filter(Boolean),
    userIds: [userId],
    orgIds: [orgId, org2Id],
  });
  await closeDb();
});

describe("campaigns", () => {
  it("creates a campaign with defaults", async () => {
    const c = await createCampaign(orgId, userId, { title: "BTC Momentum" });
    campaignId = c.id;
    expect(c.orgId).toBe(orgId);
    expect(c.title).toBe("BTC Momentum");
    expect(c.status).toBe("CAMPAIGN_BACKLOG");
    expect(c.objective).toBe("Test objective");
    expect(Array.isArray(c.markets)).toBe(true);
  });

  it("reads campaign by id", async () => {
    const db = getDb();
    const [found] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId));
    expect(found!.title).toBe("BTC Momentum");
    expect(found!.createdBy).toBe(userId);
  });

  it("updates campaign status", async () => {
    const db = getDb();
    await db
      .update(campaigns)
      .set({ status: "IDEA_RESEARCH", updatedAt: new Date() })
      .where(eq(campaigns.id, campaignId));
    const [updated] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId));
    expect(updated!.status).toBe("IDEA_RESEARCH");
  });

  it("scopes campaigns by org — cannot see other org's campaigns", async () => {
    const c2 = await createCampaign(org2Id, userId, { title: "Other Org Campaign" });
    campaign2Id = c2.id;
    const db = getDb();
    const rows = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.orgId, orgId));
    expect(rows.some((r) => r.id === campaign2Id)).toBe(false);
    expect(rows.some((r) => r.id === campaignId)).toBe(true);
  });

  it("rejects campaign with non-existent org FK", async () => {
    const db = getDb();
    await expect(
      db.insert(campaigns).values({
        id: makeId(),
        orgId: "ghost-org",
        title: "Bad Campaign",
        objective: "should fail",
        createdBy: userId,
      }),
    ).rejects.toThrow();
  });

  it("stores jsonb fields (markets, symbols, timeframes)", async () => {
    const db = getDb();
    const id = makeId();
    await db.insert(campaigns).values({
      id,
      orgId,
      title: "JSONB Test",
      objective: "test jsonb",
      createdBy: userId,
      markets: ["crypto", "forex"] as unknown as never,
      symbols: ["BTCUSDT", "ETHUSDT"] as unknown as never,
      timeframes: ["1h", "4h"] as unknown as never,
    });
    const [found] = await db.select().from(campaigns).where(eq(campaigns.id, id));
    expect(found!.markets).toEqual(["crypto", "forex"]);
    expect(found!.symbols).toEqual(["BTCUSDT", "ETHUSDT"]);
    // Cleanup
    await db.delete(campaigns).where(eq(campaigns.id, id));
  });
});
