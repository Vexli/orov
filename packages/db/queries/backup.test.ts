import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { seedDemoData } from "../seed";
import * as s from "../schema";
import { startTestDatabase, type TestDatabase } from "../test-utils";
import { listAudit } from "./audit";
import { applyImport, exportOrganization, exportOrganizationAudited, planImport } from "./backup";

let t: TestDatabase;

beforeAll(async () => {
  t = await startTestDatabase();
}, 180_000);

afterAll(async () => {
  await t?.close();
});

beforeEach(async () => {
  await t.reset();
  await seedDemoData(t.db);
});

const ADMIN = "jane@example.com";
const dataOnly = async () => (await exportOrganization(t.db, "")).data;

describe("organization export and import", () => {
  it("restores an export into an empty instance, row for row", async () => {
    // Something beyond the seed: a second drawing version and a user setting.
    await t.db.update(s.appUser).set({ dateFormat: "dmy" }).where(eq(s.appUser.email, "bob@example.com"));
    const before = await dataOnly();
    const json = JSON.stringify(await exportOrganizationAudited(t.db, ADMIN));

    await t.reset();
    const plan = await planImport(t.db, json, "replace");
    expect(plan.sections.people.create).toBe(5);
    await applyImport(t.db, ADMIN, json, { mode: "replace", applyRoles: true });

    expect(await dataOnly()).toEqual(before);
    expect((await listAudit(t.db, { entity: "organization" }))[0]).toMatchObject({ action: "import" });
  });

  it("never exports tokens, presence or the audit log", async () => {
    const exported = JSON.stringify(await exportOrganization(t.db, ADMIN));
    expect(Object.keys((await exportOrganization(t.db, ADMIN)).data)).not.toContain("messagingUserTokens");
    for (const word of ["encryptedToken", "presence", "actorEmail"]) expect(exported).not.toContain(word);
  });

  it("merges by id: an unchanged file changes nothing, and a reused email is a conflict", async () => {
    const exported = await exportOrganization(t.db, ADMIN);
    const plan = await planImport(t.db, JSON.stringify(exported), "merge");
    expect(plan.sections.people).toEqual({ create: 0, update: 0, unchanged: 5, conflicts: [] });

    // Another instance's person with Bob's email under a different id.
    const other = { ...exported, data: { ...exported.data, people: [{ ...exported.data.people[0]!, id: "p_other" }] } };
    const conflicting = await planImport(t.db, JSON.stringify(other), "merge");
    expect(conflicting.canApply).toBe(false);
    expect(conflicting.sections.people.conflicts[0]).toMatch(/email ".*" is already used/);
    await expect(applyImport(t.db, ADMIN, JSON.stringify(other), { mode: "merge", applyRoles: false })).rejects.toThrow(
      /conflicts/,
    );
  });

  it("keeps the importing admin an admin, and leaves roles alone unless asked", async () => {
    const exported = await exportOrganization(t.db, ADMIN);
    const demoted = {
      ...exported,
      data: {
        ...exported.data,
        appUsers: exported.data.appUsers.map((u) => ({ ...u, role: u.email === "bob@example.com" ? "admin" : "viewer" })),
      },
    };
    await applyImport(t.db, ADMIN, JSON.stringify(demoted), { mode: "merge", applyRoles: false });
    const roles = async () =>
      Object.fromEntries((await t.db.select().from(s.appUser)).map((u) => [u.email, u.role]));
    expect((await roles())["bob@example.com"]).toBe("viewer");

    await applyImport(t.db, ADMIN, JSON.stringify(demoted), { mode: "merge", applyRoles: true });
    expect(await roles()).toMatchObject({ "bob@example.com": "admin", [ADMIN]: "admin" });
  });

  it("refuses a file from another schema version", async () => {
    const exported = await exportOrganization(t.db, ADMIN);
    const newer = { ...exported, meta: { ...exported.meta, schemaVersion: exported.meta.schemaVersion + 1 } };
    await expect(planImport(t.db, JSON.stringify(newer), "merge")).rejects.toThrow(/newer version/);
  });
});
