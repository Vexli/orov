import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readDemoExport } from "./file";

// No database: these run with the unit tests, so a stale demo file fails fast.

const journal = JSON.parse(
  readFileSync(new URL("../migrations/meta/_journal.json", import.meta.url), "utf8"),
) as { entries: { when: number; tag: string }[] };

describe("the committed demo file", () => {
  const exported = JSON.parse(readDemoExport()) as {
    meta: { schemaVersion: number; counts: Record<string, number> };
  };

  it("is from the latest migration, so it imports into a current instance", () => {
    const latest = journal.entries.at(-1)!;
    // A backup imports only into the schema version it was exported from.
    expect(
      exported.meta.schemaVersion,
      `demo/orov-demo.json predates migration ${latest.tag}: run pnpm demo:build and commit it`,
    ).toBe(latest.when);
  });

  it("holds the whole demo organization", () => {
    expect(exported.meta.counts).toMatchObject({
      locations: 3,
      floors: 6,
      svgAssets: 6,
      themes: 1,
    });
    expect(exported.meta.counts.people).toBeGreaterThanOrEqual(100);
    expect(exported.meta.counts.teams).toBeGreaterThanOrEqual(20);
  });
});
