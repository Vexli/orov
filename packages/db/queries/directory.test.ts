import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDemoData } from "../seed";
import { startTestDatabase, type TestDatabase } from "../test-utils";
import { loadDirectory } from "./directory";

let t: TestDatabase;

beforeAll(async () => {
  t = await startTestDatabase();
  await seedDemoData(t.db);
}, 180_000);

afterAll(async () => {
  await t?.close();
});

describe("loadDirectory", () => {
  const labelsFor = async (display: Parameters<typeof loadDirectory>[1]) => {
    const { people } = await loadDirectory(t.db, display);
    return Object.fromEntries(
      people.map((p) => [p.id, { code: p.homeRegion, label: p.homeRegionLabel }]),
    );
  };

  it("labels home regions with region and country names by default", async () => {
    const people = await labelsFor(undefined);
    expect(people.p_jane).toEqual({ code: "CA-ON", label: "Ontario, Canada" });
    expect(people.p_sam).toEqual({ code: "US", label: "United States" });
  });

  it("follows the viewer's preference", async () => {
    expect((await labelsFor("code")).p_bob?.label).toBe("US-CA");
    expect((await labelsFor("country")).p_bob?.label).toBe("United States");
    expect((await labelsFor("region")).p_bob?.label).toBe("California");
    // A country-only code has no region name, so it falls back to the country.
    expect((await labelsFor("region")).p_sam?.label).toBe("United States");
  });

  it("carries the office's region code with the desk", async () => {
    const { people } = await loadDirectory(t.db);
    expect(people.find((p) => p.id === "p_jane")?.desk?.locationRegion).toBe("US-CA");
  });
});
