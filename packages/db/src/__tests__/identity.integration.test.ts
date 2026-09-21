/**
 * Integration tests: organisations, users, memberships
 * Verifies FK relationships, unique constraints, and org-scoped reads.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, and } from "drizzle-orm";
import { getDb, closeDb } from "../client.js";
import { organisations, users, memberships } from "../schema/index.js";
import {
  makeId,
  createOrg,
  createUser,
  createMembership,
  cleanup,
} from "./helpers.js";

let orgId: string;
let org2Id: string;
let userId: string;
let user2Id: string;
let membershipId: string;

beforeAll(async () => {
  const org = await createOrg({ name: "Identity Test Org" });
  const org2 = await createOrg({ name: "Identity Test Org 2" });
  orgId = org.id;
  org2Id = org2.id;
});

afterAll(async () => {
  await cleanup({
    membershipIds: membershipId ? [membershipId] : [],
    userIds: [userId, user2Id].filter(Boolean),
    orgIds: [orgId, org2Id],
  });
  await closeDb();
});

describe("organisations", () => {
  it("creates an org and reads it back", async () => {
    const db = getDb();
    const [found] = await db
      .select()
      .from(organisations)
      .where(eq(organisations.id, orgId));
    expect(found).toBeDefined();
    expect(found!.name).toBe("Identity Test Org");
    expect(found!.createdAt).toBeInstanceOf(Date);
  });

  it("requires a name", async () => {
    const db = getDb();
    await expect(
      db.insert(organisations).values({ id: makeId(), name: null as unknown as string }),
    ).rejects.toThrow();
  });
});

describe("users", () => {
  it("creates a user scoped to an org", async () => {
    const user = await createUser(orgId, { email: "alice@test.local" });
    userId = user.id;
    expect(user.orgId).toBe(orgId);
    expect(user.email).toBe("alice@test.local");
    expect(user.role).toBe("RESEARCHER");
  });

  it("rejects user with non-existent org FK", async () => {
    const db = getDb();
    await expect(
      db.insert(users).values({
        id: makeId(),
        orgId: "non-existent-org",
        email: "ghost@test.local",
        role: "RESEARCHER",
      }),
    ).rejects.toThrow();
  });

  it("reads user by org scope", async () => {
    const db = getDb();
    const rows = await db.select().from(users).where(eq(users.orgId, orgId));
    expect(rows.some((u) => u.id === userId)).toBe(true);
  });

  it("does not return users from another org", async () => {
    const user2 = await createUser(org2Id, { email: "bob@test.local" });
    user2Id = user2.id;
    const db = getDb();
    const rows = await db.select().from(users).where(eq(users.orgId, orgId));
    expect(rows.some((u) => u.id === user2Id)).toBe(false);
  });
});

describe("memberships", () => {
  it("creates a membership linking user to org", async () => {
    const m = await createMembership(userId, orgId, "ADMIN");
    membershipId = m.id;
    expect(m.userId).toBe(userId);
    expect(m.orgId).toBe(orgId);
    expect(m.role).toBe("ADMIN");
  });

  it("enforces unique (user_id, org_id) constraint", async () => {
    // Inserting the same user+org pair again must throw
    await expect(
      createMembership(userId, orgId),
    ).rejects.toThrow();
  });

  it("allows same user in a different org", async () => {
    const db = getDb();
    const m = await db
      .insert(memberships)
      .values({ id: makeId(), userId, orgId: org2Id, role: "RESEARCHER" })
      .returning();
    expect(m[0]!.orgId).toBe(org2Id);
    // Cleanup this extra membership
    await db.delete(memberships).where(eq(memberships.id, m[0]!.id));
  });

  it("rejects membership with non-existent user", async () => {
    await expect(
      createMembership("non-existent-user", orgId),
    ).rejects.toThrow();
  });
});
