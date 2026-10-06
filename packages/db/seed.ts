import { createDb } from "./client";
import { loadDemo } from "./demo/file";
import { resetDatabase } from "./reset";

// `pnpm db:seed`: wipes the database named by DATABASE_URL and loads the demo organization
// (demo/orov-demo.json) through the backup import, as Admin → Backup → Replace would. For local
// development; a new install starts empty. It refuses to run in production.

if (process.env.NODE_ENV === "production") {
  throw new Error("Refusing to seed in production");
}
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const { db, pool } = createDb(url);
try {
  await resetDatabase(db);
  await loadDemo(db, "seed");
  console.log("loaded the demo organization");
} finally {
  await pool.end();
}
