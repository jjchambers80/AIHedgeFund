import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _sql: ReturnType<typeof postgres> | null = null;

export function getDb(databaseUrl?: string) {
  if (_db) return _db;
  const url = databaseUrl ?? process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not set");
  _sql = postgres(url, { max: 10 });
  _db = drizzle(_sql, { schema });
  return _db;
}

export type Db = ReturnType<typeof getDb>;

/** For use in tests — close the connection pool. */
export async function closeDb() {
  if (_sql) {
    await _sql.end();
    _sql = null;
    _db = null;
  }
}
