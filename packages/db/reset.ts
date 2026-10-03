import { sql } from "drizzle-orm";
import type { Executor } from "./client";

// Empties every application table in the public schema. Used by the seed CLI and by tests
// between cases. Drizzle's bookkeeping table lives in its own `drizzle` schema, so it is untouched.
export async function resetDatabase(db: Executor): Promise<void> {
  await db.execute(sql`
    DO $$
    DECLARE r record;
    BEGIN
      FOR r IN
        SELECT tablename FROM pg_tables WHERE schemaname = 'public'
      LOOP
        EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' RESTART IDENTITY CASCADE';
      END LOOP;
    END $$;
  `);
}
