/**
 * Development seed — creates the stub auth org and user so local dev works
 * without Clerk. Safe to run multiple times (upserts).
 */
import { getDb, closeDb } from "./client.js";
import { organisations, users } from "./schema/index.js";
import { sql } from "drizzle-orm";

async function seed() {
  const db = getDb();

  await db
    .insert(organisations)
    .values({ id: "org_dev", name: "Dev Organisation" })
    .onConflictDoNothing();

  await db
    .insert(users)
    .values({
      id: "user_dev",
      orgId: "org_dev",
      email: "dev@localhost",
      displayName: "Dev User",
      role: "ADMIN",
    })
    .onConflictDoNothing();

  console.log("Seed complete: org_dev + user_dev ready.");
  await closeDb();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
