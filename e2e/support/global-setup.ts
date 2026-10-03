import { runMigrations } from "@officeorg/db/migrate";
import { E2E_DATABASE_URL } from "./database";

// Brings the e2e database schema up to date once per run. Each spec reseeds it in beforeEach.
export default async function globalSetup() {
  await runMigrations(E2E_DATABASE_URL);
}
