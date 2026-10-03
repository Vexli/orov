import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { appUser } from "../schema";
import { startTestDatabase, type TestDatabase } from "../test-utils";
import { getAppRole, getAppUser, recordSignIn, setRegionDisplay } from "./app-users";

let t: TestDatabase;

beforeAll(async () => {
  t = await startTestDatabase();
}, 180_000);

afterAll(async () => {
  await t?.close();
});

beforeEach(async () => {
  await t.reset();
});

describe("recordSignIn", () => {
  it("creates a viewer for a new person", async () => {
    await expect(recordSignIn(t.db, "bob@example.com", false)).resolves.toBe("viewer");
    await expect(getAppRole(t.db, "bob@example.com")).resolves.toBe("viewer");
  });

  it("promotes a bootstrap admin, including on a later sign-in", async () => {
    await recordSignIn(t.db, "jane@example.com", false);
    await expect(recordSignIn(t.db, "jane@example.com", true)).resolves.toBe("admin");
    await expect(getAppRole(t.db, "jane@example.com")).resolves.toBe("admin");
  });

  it("does not demote an admin who is no longer on the bootstrap list", async () => {
    await recordSignIn(t.db, "jane@example.com", true);
    await expect(recordSignIn(t.db, "jane@example.com", false)).resolves.toBe("admin");
  });

  it("updates lastSeenAt on every sign-in", async () => {
    await recordSignIn(t.db, "bob@example.com", false);
    const first = await t.db.query.appUser.findFirst({ where: eq(appUser.email, "bob@example.com") });
    await new Promise((r) => setTimeout(r, 10));
    await recordSignIn(t.db, "bob@example.com", false);
    const second = await t.db.query.appUser.findFirst({ where: eq(appUser.email, "bob@example.com") });
    expect(second?.lastSeenAt?.getTime()).toBeGreaterThan(first?.lastSeenAt?.getTime() ?? 0);
  });
});

describe("getAppRole", () => {
  it("returns null for someone with no row", async () => {
    await expect(getAppRole(t.db, "stranger@example.com")).resolves.toBeNull();
  });
});

describe("region display preference", () => {
  it("defaults to region and country names", async () => {
    await recordSignIn(t.db, "bob@example.com", false);
    await expect(getAppUser(t.db, "bob@example.com")).resolves.toEqual({
      role: "viewer",
      regionDisplay: "country_region",
    });
  });

  it("is stored per user, and a later sign-in keeps it", async () => {
    await recordSignIn(t.db, "bob@example.com", false);
    await recordSignIn(t.db, "jane@example.com", true);
    await setRegionDisplay(t.db, "bob@example.com", "code");
    await recordSignIn(t.db, "bob@example.com", false);

    await expect(getAppUser(t.db, "bob@example.com")).resolves.toMatchObject({ regionDisplay: "code" });
    await expect(getAppUser(t.db, "jane@example.com")).resolves.toMatchObject({ regionDisplay: "country_region" });
  });

  it("returns null for someone with no row", async () => {
    await expect(getAppUser(t.db, "stranger@example.com")).resolves.toBeNull();
  });
});
