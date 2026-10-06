import { writeFileSync } from "node:fs";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { encryptExport } from "@orov/core/backup/crypto";
import { createDb } from "../client";
import { runMigrations } from "../migrate";
import { exportOrganization } from "../queries/backup";
import { buildDemoOrganization } from "./build";
import { DEMO_FILE, DEMO_PASSPHRASE } from "./file";

// `pnpm demo:build`: builds the demo organization in a throwaway Postgres (Docker, as for the
// database tests), exports it as a backup and writes demo/orov-demo.json. Run it after any
// migration or any change to demo/*.ts, and commit the file.

const container = await new PostgreSqlContainer("postgres:16-alpine").start();
try {
  const url = container.getConnectionUri();
  await runMigrations(url);
  const { db, pool } = createDb(url);
  try {
    await buildDemoOrganization(db);
    const exported = await exportOrganization(db, "demo");
    writeFileSync(
      DEMO_FILE,
      `${JSON.stringify(encryptExport(JSON.stringify(exported), DEMO_PASSPHRASE))}\n`,
    );
    console.log(`wrote ${DEMO_FILE.pathname}`, exported.meta.counts);
  } finally {
    await pool.end();
  }
} finally {
  await container.stop();
}
