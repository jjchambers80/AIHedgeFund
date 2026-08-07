import { migrate } from "drizzle-orm/postgres-js/migrator";
import { getDb, closeDb } from "./client.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const db = getDb();
  await migrate(db, { migrationsFolder: join(__dirname, "..", "drizzle") });
  console.log("Migrations complete");
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
