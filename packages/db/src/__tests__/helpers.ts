/**
 * Shared fixtures and helpers for DB integration tests.
 * Each test file should call makeFixtures() in beforeAll and cleanup() in afterAll.
 */
import { uuidv7 } from "uuidv7";
import { getDb } from "../client.js";
import {
  organisations,
  users,
  memberships,
  campaigns,
  strategies,
  strategyVersions,
  auditEvents,
  idempotencyRecords,
} from "../schema/index.js";
import { eq, inArray } from "drizzle-orm";

export { uuidv7 };

export function makeId() {
  return uuidv7();
}

/** Create a minimal org. Returns the inserted org row. */
export async function createOrg(overrides: Partial<{ id: string; name: string }> = {}) {
  const db = getDb();
  const id = overrides.id ?? makeId();
  const [org] = await db
    .insert(organisations)
    .values({ id, name: overrides.name ?? `Test Org ${id.slice(0, 8)}` })
    .returning();
  return org!;
}

/** Create a minimal user belonging to an org. */
export async function createUser(
  orgId: string,
  overrides: Partial<{ id: string; email: string; role: string }> = {},
) {
  const db = getDb();
  const id = overrides.id ?? makeId();
  const [user] = await db
    .insert(users)
    .values({
      id,
      orgId,
      email: overrides.email ?? `user-${id.slice(0, 8)}@test.local`,
      role: overrides.role ?? "RESEARCHER",
    })
    .returning();
  return user!;
}

/** Create a membership linking a user to an org. */
export async function createMembership(userId: string, orgId: string, role = "RESEARCHER") {
  const db = getDb();
  const [m] = await db
    .insert(memberships)
    .values({ id: makeId(), userId, orgId, role })
    .returning();
  return m!;
}

/** Create a minimal campaign. */
export async function createCampaign(
  orgId: string,
  createdBy: string,
  overrides: Partial<{ id: string; title: string; status: string }> = {},
) {
  const db = getDb();
  const id = overrides.id ?? makeId();
  const [campaign] = await db
    .insert(campaigns)
    .values({
      id,
      orgId,
      title: overrides.title ?? `Campaign ${id.slice(0, 8)}`,
      objective: "Test objective",
      createdBy,
      status: overrides.status ?? "CAMPAIGN_BACKLOG",
    })
    .returning();
  return campaign!;
}

/** Create a minimal strategy. */
export async function createStrategy(
  orgId: string,
  createdBy: string,
  campaignId?: string,
  overrides: Partial<{ id: string; name: string }> = {},
) {
  const db = getDb();
  const id = overrides.id ?? makeId();
  const [strategy] = await db
    .insert(strategies)
    .values({
      id,
      orgId,
      campaignId: campaignId ?? null,
      name: overrides.name ?? `Strategy ${id.slice(0, 8)}`,
      family: "momentum",
      createdBy,
    })
    .returning();
  return strategy!;
}

/** Create a minimal strategy version. */
export async function createStrategyVersion(
  strategyId: string,
  createdBy: string,
  overrides: Partial<{ id: string; lifecycleState: string; versionNumber: number }> = {},
) {
  const db = getDb();
  const id = overrides.id ?? makeId();
  const [version] = await db
    .insert(strategyVersions)
    .values({
      id,
      strategyId,
      versionNumber: overrides.versionNumber ?? 1,
      status: "DRAFT",
      lifecycleState: overrides.lifecycleState ?? "CAMPAIGN_BACKLOG",
      createdBy,
    })
    .returning();
  return version!;
}

/** Create an audit event. */
export async function createAuditEvent(
  orgId: string,
  actorId: string,
  action: string,
  aggregateType: string,
  aggregateId: string,
) {
  const db = getDb();
  const [event] = await db
    .insert(auditEvents)
    .values({
      id: makeId(),
      orgId,
      actorType: "USER",
      actorId,
      action,
      aggregateType,
      aggregateId,
    })
    .returning();
  return event!;
}

/**
 * Delete test data created during a test run in safe FK order.
 * Pass arrays of IDs for each entity type.
 */
export async function cleanup(ids: {
  idempotencyIds?: string[];
  auditIds?: string[];
  strategyVersionIds?: string[];
  strategyIds?: string[];
  campaignIds?: string[];
  membershipIds?: string[];
  userIds?: string[];
  orgIds?: string[];
}) {
  const db = getDb();
  if (ids.idempotencyIds?.length) {
    await db.delete(idempotencyRecords).where(inArray(idempotencyRecords.id, ids.idempotencyIds));
  }
  if (ids.auditIds?.length) {
    await db.delete(auditEvents).where(inArray(auditEvents.id, ids.auditIds));
  }
  if (ids.strategyVersionIds?.length) {
    await db
      .delete(strategyVersions)
      .where(inArray(strategyVersions.id, ids.strategyVersionIds));
  }
  if (ids.strategyIds?.length) {
    await db.delete(strategies).where(inArray(strategies.id, ids.strategyIds));
  }
  if (ids.campaignIds?.length) {
    await db.delete(campaigns).where(inArray(campaigns.id, ids.campaignIds));
  }
  if (ids.membershipIds?.length) {
    await db.delete(memberships).where(inArray(memberships.id, ids.membershipIds));
  }
  if (ids.userIds?.length) {
    await db.delete(users).where(inArray(users.id, ids.userIds));
  }
  if (ids.orgIds?.length) {
    await db.delete(organisations).where(inArray(organisations.id, ids.orgIds));
  }
}
