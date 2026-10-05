import { createDb } from "@orov/db/client";
import { resetDatabase } from "@orov/db/reset";
import { seedDemoData } from "@orov/db/seed";

export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "postgres://orov:orov@localhost:5432/orov_e2e";

// Every spec starts from the same demo data. Specs write (create people, apply imports), so a
// shared database would make the order of files matter.
export async function resetE2eDatabase(): Promise<void> {
  const { db, pool } = createDb(E2E_DATABASE_URL);
  try {
    await resetDatabase(db);
    await seedDemoData(db);
  } finally {
    await pool.end();
  }
}

// For specs that arrange state the UI would take many steps to reach, such as an applied theme.
export async function withE2eDb<T>(
  run: (db: ReturnType<typeof createDb>["db"]) => Promise<T>,
): Promise<T> {
  const { db, pool } = createDb(E2E_DATABASE_URL);
  try {
    return await run(db);
  } finally {
    await pool.end();
  }
}
