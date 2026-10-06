import { readFileSync } from "node:fs";
import { decryptExport } from "@orov/core/backup/crypto";
import type { Database } from "../client";
import { applyImport } from "../queries/backup";

// The demo organization ships as an ordinary backup file (Admin → Backup), encrypted with a
// published passphrase. Anyone can load it into an instance with Replace; `pnpm db:seed` loads it
// for local development. A backup only imports into the schema version it was exported from, so
// `pnpm demo:build` must be rerun after every migration (a test checks).

export const DEMO_FILE = new URL("../../../demo/orov-demo.json", import.meta.url);

// Not a secret: published in the README so anyone can import the demo.
export const DEMO_PASSPHRASE = "orov-demo-data";

export function readDemoExport(): string {
  return decryptExport(readFileSync(DEMO_FILE, "utf8"), DEMO_PASSPHRASE);
}

// Replaces the organization with the demo, roles included, as the backup page's Replace does.
export async function loadDemo(db: Database, actorEmail: string): Promise<void> {
  await applyImport(db, actorEmail, readDemoExport(), { mode: "replace", applyRoles: true });
}
