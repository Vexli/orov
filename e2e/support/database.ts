import { createDb } from "@officeorg/db/client";
import { resetDatabase } from "@officeorg/db/reset";
import { seedDemoData } from "@officeorg/db/seed";

export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "postgres://officeorg:officeorg@localhost:5432/officeorg_e2e";

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
