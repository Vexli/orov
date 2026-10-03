import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createDb, type Database } from "./client";
import { runMigrations } from "./migrate";
import { resetDatabase } from "./reset";
import type pg from "pg";

export interface TestDatabase {
  url: string;
  db: Database;
  pool: pg.Pool;
  reset(): Promise<void>;
  close(): Promise<void>;
}

// Starts a disposable Postgres 16 container, applies every migration, and returns a client.
// Call from beforeAll and close in afterAll. One container per test file keeps files isolated.
export async function startTestDatabase(): Promise<TestDatabase> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer("postgres:16-alpine").start();
  const url = container.getConnectionUri();
  await runMigrations(url);
  const { db, pool } = createDb(url);
  return {
    url,
    db,
    pool,
    reset: () => resetDatabase(db),
    close: async () => {
      await pool.end();
      await container.stop();
    },
  };
}
