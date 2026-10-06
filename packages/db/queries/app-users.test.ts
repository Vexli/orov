import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { appUser, authUser } from "../schema";
import { startTestDatabase, type TestDatabase } from "../test-utils";
import { admitSession, getAppRole, getAppUser, recordSignIn, setUserSettings } from "./app-users";

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

describe("admitSession", () => {
  const POLICY = { companyDomain: "example.com", adminEmails: ["jane@example.com"] };
  const addAuthUser = (id: string, email: string) =>
    t.db.insert(authUser).values({ id, name: email, email, emailVerified: true });

  it("admits a company account and records the sign-in, bootstrapping admins", async () => {
    await addAuthUser("u_jane", "Jane@Example.com");
    await addAuthUser("u_bob", "bob@example.com");
    await expect(admitSession(t.db, "u_jane", POLICY)).resolves.toBe(true);
    await expect(admitSession(t.db, "u_bob", POLICY)).resolves.toBe(true);
    await expect(getAppRole(t.db, "jane@example.com")).resolves.toBe("admin");
    await expect(getAppRole(t.db, "bob@example.com")).resolves.toBe("viewer");
  });

  it("refuses another domain, or an unknown user, without recording anything", async () => {
    await addAuthUser("u_eve", "eve@example.org");
    await expect(admitSession(t.db, "u_eve", POLICY)).resolves.toBe(false);
    await expect(admitSession(t.db, "u_missing", POLICY)).resolves.toBe(false);
    await expect(t.db.select().from(appUser)).resolves.toEqual([]);
  });

  it("doesn't accept a lookalike domain", async () => {
    await addAuthUser("u_mallory", "mallory@evil-example.com");
    await expect(admitSession(t.db, "u_mallory", POLICY)).resolves.toBe(false);
  });
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
    const first = await t.db.query.appUser.findFirst({
      where: eq(appUser.email, "bob@example.com"),
    });
    await new Promise((r) => setTimeout(r, 10));
    await recordSignIn(t.db, "bob@example.com", false);
    const second = await t.db.query.appUser.findFirst({
      where: eq(appUser.email, "bob@example.com"),
    });
    expect(second?.lastSeenAt?.getTime()).toBeGreaterThan(first?.lastSeenAt?.getTime() ?? 0);
  });
});

describe("getAppRole", () => {
  it("saves only the settings it's given", async () => {
    await recordSignIn(t.db, "bob@example.com", false);
    await setUserSettings(t.db, "bob@example.com", { regionDisplay: "code", dateFormat: "dmy" });
    await setUserSettings(t.db, "bob@example.com", { dateFormat: "mdy" });
    await expect(getAppUser(t.db, "bob@example.com")).resolves.toMatchObject({
      regionDisplay: "code",
      dateFormat: "mdy",
    });
  });

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
      regionFlag: false,
      dateFormat: "iso",
      locale: "en",
    });
  });

  it("reads a language that's no longer offered as English", async () => {
    await recordSignIn(t.db, "bob@example.com", false);
    await setUserSettings(t.db, "bob@example.com", { locale: "de" });
    await expect(getAppUser(t.db, "bob@example.com")).resolves.toMatchObject({ locale: "de" });
    await t.db.update(appUser).set({ locale: "tlh" }).where(eq(appUser.email, "bob@example.com"));
    await expect(getAppUser(t.db, "bob@example.com")).resolves.toMatchObject({ locale: "en" });
  });

  it("is stored per user, and a later sign-in keeps it", async () => {
    await recordSignIn(t.db, "bob@example.com", false);
    await recordSignIn(t.db, "jane@example.com", true);
    await setUserSettings(t.db, "bob@example.com", { regionDisplay: "code" });
    await recordSignIn(t.db, "bob@example.com", false);

    await expect(getAppUser(t.db, "bob@example.com")).resolves.toMatchObject({
      regionDisplay: "code",
    });
    await expect(getAppUser(t.db, "jane@example.com")).resolves.toMatchObject({
      regionDisplay: "country_region",
    });
  });

  it("saves only the settings it's given", async () => {
    await recordSignIn(t.db, "bob@example.com", false);
    await setUserSettings(t.db, "bob@example.com", { regionDisplay: "code", dateFormat: "dmy" });
    await setUserSettings(t.db, "bob@example.com", { dateFormat: "mdy" });
    await expect(getAppUser(t.db, "bob@example.com")).resolves.toMatchObject({
      regionDisplay: "code",
      dateFormat: "mdy",
    });
  });

  it("returns null for someone with no row", async () => {
    await expect(getAppUser(t.db, "stranger@example.com")).resolves.toBeNull();
  });
});
