import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PgDatabase } from "drizzle-orm/pg-core";
import pg from "pg";
import * as schema from "./schema";

// Queries accept this type so they run unchanged inside a transaction or on the plain pool.
export type Executor = PgDatabase<NodePgQueryResultHKT, typeof schema>;

export function createDb(connectionString: string) {
  const pool = new pg.Pool({ connectionString });
  return { db: drizzle(pool, { schema }), pool };
}

export type Database = ReturnType<typeof createDb>["db"];

// One pool per process. Next.js dev reloads modules, so the pool lives on globalThis.
export function getDb(): Database {
  const g = globalThis as typeof globalThis & {
    __orovDb?: ReturnType<typeof createDb>;
  };
  if (!g.__orovDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    g.__orovDb = createDb(url);
  }
  return g.__orovDb.db;
}
