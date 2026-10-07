import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { appUser, auditLog, authAccount, authSession, authUser, person } from "../schema";
import { startTestDatabase, type TestDatabase } from "../test-utils";
import {
  admitSession,
  changeUserAccess,
  getAppRole,
  getAppUser,
  hasAccess,
  listAppUsers,
  recordSignIn,
  setUserSettings,
} from "./app-users";
import { ValidationError } from "./errors";

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

describe("access", () => {
  const POLICY = { companyDomain: "example.com", adminEmails: [] };
  const addPerson = (email: string, values: Partial<typeof person.$inferInsert> = {}) =>
    t.db.insert(person).values({ email, givenName: email, homeRegion: "US", ...values });
  const signIn = async (id: string, email: string) => {
    await t.db.insert(authUser).values({ id, name: email, email, emailVerified: true });
    return admitSession(t.db, id, POLICY);
  };

  it("lets in someone with no directory entry, or an active one", async () => {
    await addPerson("bob@example.com");
    await expect(signIn("u_bob", "bob@example.com")).resolves.toBe(true);
    await expect(signIn("u_max", "max@example.com")).resolves.toBe(true);
    await expect(getAppUser(t.db, "bob@example.com")).resolves.not.toBeNull();
    await expect(getAppUser(t.db, "max@example.com")).resolves.not.toBeNull();
  });

  it("refuses someone inactive in the directory, at sign-in and on every request", async () => {
    await recordSignIn(t.db, "bob@example.com", false);
    await addPerson("bob@example.com", { active: false });
    await expect(hasAccess(t.db, "bob@example.com")).resolves.toBe(false);
    await expect(signIn("u_bob", "bob@example.com")).resolves.toBe(false);
    await expect(getAppUser(t.db, "bob@example.com")).resolves.toBeNull();
  });

  it("refuses someone past their final date, but not on it", async () => {
    await recordSignIn(t.db, "bob@example.com", false);
    await recordSignIn(t.db, "max@example.com", false);
    await addPerson("bob@example.com", { endDate: sql`CURRENT_DATE - 1` as unknown as string });
    await addPerson("max@example.com", { endDate: sql`CURRENT_DATE` as unknown as string });
    await expect(getAppUser(t.db, "bob@example.com")).resolves.toBeNull();
    await expect(getAppUser(t.db, "max@example.com")).resolves.not.toBeNull();
  });

  it("refuses a disabled user, and lets them back in once enabled", async () => {
    await recordSignIn(t.db, "admin@example.com", true);
    await expect(signIn("u_bob", "bob@example.com")).resolves.toBe(true);
    await changeUserAccess(t.db, "admin@example.com", "bob@example.com", { kind: "disable" });
    await expect(getAppUser(t.db, "bob@example.com")).resolves.toBeNull();
    await expect(admitSession(t.db, "u_bob", POLICY)).resolves.toBe(false);
    await changeUserAccess(t.db, "admin@example.com", "bob@example.com", { kind: "enable" });
    await expect(admitSession(t.db, "u_bob", POLICY)).resolves.toBe(true);
    await expect(getAppUser(t.db, "bob@example.com")).resolves.not.toBeNull();
  });
});

describe("changeUserAccess", () => {
  const ADMIN = "admin@example.com";
  const future = () => new Date(Date.now() + 60 * 60 * 1000);
  async function signedIn(email: string, sessions: number) {
    const id = `u_${email.split("@")[0]}`;
    await recordSignIn(t.db, email, false);
    await t.db.insert(authUser).values({ id, name: email, email, emailVerified: true });
    await t.db.insert(authAccount).values({
      id: `a_${id}`,
      userId: id,
      accountId: "sub",
      providerId: "okta",
    });
    for (let i = 0; i < sessions; i++) {
      await t.db
        .insert(authSession)
        .values({ id: `s_${id}_${i}`, userId: id, token: `t_${id}_${i}`, expiresAt: future() });
    }
    return id;
  }
  const sessionsOf = async (userId: string) =>
    (await t.db.select().from(authSession).where(eq(authSession.userId, userId))).length;

  beforeEach(async () => {
    await recordSignIn(t.db, ADMIN, true);
  });

  it("disabling ends every session of that user only, and is audited", async () => {
    const bob = await signedIn("bob@example.com", 2);
    const max = await signedIn("max@example.com", 1);
    await changeUserAccess(t.db, ADMIN, "bob@example.com", { kind: "disable" });
    expect(await sessionsOf(bob)).toBe(0);
    expect(await sessionsOf(max)).toBe(1);
    const [entry] = await t.db.select().from(auditLog).where(eq(auditLog.entity, "app_user"));
    expect(entry).toMatchObject({
      actorEmail: ADMIN,
      entityId: "bob@example.com",
      action: "update",
    });
    expect(entry?.after).toMatchObject({ change: "disable", sessionsEnded: 2 });
  });

  it("changes a role", async () => {
    await signedIn("bob@example.com", 0);
    await changeUserAccess(t.db, ADMIN, "bob@example.com", { kind: "role", role: "admin" });
    await expect(getAppRole(t.db, "bob@example.com")).resolves.toBe("admin");
  });

  it("ends sessions without disabling", async () => {
    const bob = await signedIn("bob@example.com", 2);
    await changeUserAccess(t.db, ADMIN, "bob@example.com", { kind: "end-sessions" });
    expect(await sessionsOf(bob)).toBe(0);
    await expect(hasAccess(t.db, "bob@example.com")).resolves.toBe(true);
  });

  it("resetting sign-in removes the sign-in record, its provider links and sessions", async () => {
    const bob = await signedIn("bob@example.com", 1);
    await changeUserAccess(t.db, ADMIN, "bob@example.com", { kind: "reset-sign-in" });
    await expect(t.db.select().from(authUser).where(eq(authUser.id, bob))).resolves.toEqual([]);
    await expect(t.db.select().from(authAccount)).resolves.toEqual([]);
    expect(await sessionsOf(bob)).toBe(0);
    // The role and settings stay.
    await expect(getAppRole(t.db, "bob@example.com")).resolves.toBe("viewer");
  });

  it("refuses a change to your own access, and to someone who never signed in", async () => {
    await expect(
      changeUserAccess(t.db, "Admin@Example.com", ADMIN, { kind: "disable" }),
    ).rejects.toThrow(ValidationError);
    await expect(
      changeUserAccess(t.db, ADMIN, "nobody@example.com", { kind: "disable" }),
    ).rejects.toThrow(ValidationError);
    await expect(getAppUser(t.db, ADMIN)).resolves.not.toBeNull();
  });
});

describe("listAppUsers", () => {
  it("shows each user's access, live sessions and directory entry", async () => {
    await recordSignIn(t.db, "bob@example.com", false);
    await recordSignIn(t.db, "max@example.com", false);
    await t.db
      .insert(person)
      .values({ email: "max@example.com", givenName: "Max", homeRegion: "US", active: false });
    await t.db
      .insert(authUser)
      .values({ id: "u_bob", name: "bob", email: "bob@example.com", emailVerified: true });
    await t.db.insert(authSession).values([
      { id: "s1", userId: "u_bob", token: "t1", expiresAt: new Date(Date.now() + 60_000) },
      { id: "s2", userId: "u_bob", token: "t2", expiresAt: new Date(Date.now() - 60_000) },
    ]);
    const rows = await listAppUsers(t.db);
    expect(
      rows.map((r) => [r.email, r.sessions, r.hasSignIn, r.personName, r.personInGoodStanding]),
    ).toEqual([
      ["bob@example.com", 1, true, null, true],
      ["max@example.com", 0, false, "Max", false],
    ]);
  });
});
