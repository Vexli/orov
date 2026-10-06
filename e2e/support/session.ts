import { randomBytes } from "node:crypto";
import { serializeSignedCookie } from "better-call";
import type { BrowserContext, Page } from "@playwright/test";
import { authSession, authUser } from "@orov/db/schema";
import { E2E_AUTH_SECRET } from "./constants";
import { withE2eDb } from "./database";

// Better Auth's session cookie on an http (localhost) origin. A secure origin prefixes __Secure-.
const SESSION_COOKIE = "better-auth.session_token";

// Signs in as `email` by writing the session a provider sign-in would leave behind (a Better Auth
// user and session row) and setting its cookie, signed with the e2e AUTH_SECRET the way Better
// Auth signs it. The proxy, the session lookup and the database role lookup then run exactly as in
// production. A provider round-trip can't run offline, so canSignIn and admitSession are covered
// by their unit and database tests instead.
export async function signInAs(context: BrowserContext, email: string) {
  const token = randomBytes(24).toString("base64url");
  await withE2eDb(async (db) => {
    const [user] = await db
      .insert(authUser)
      .values({
        id: `e2e_${randomBytes(8).toString("hex")}`,
        name: email,
        email,
        emailVerified: true,
      })
      .onConflictDoUpdate({ target: authUser.email, set: { updatedAt: new Date() } })
      .returning({ id: authUser.id });
    await db.insert(authSession).values({
      id: `e2e_${randomBytes(8).toString("hex")}`,
      userId: user!.id,
      token,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
  });
  // "name=value; …": only the signed value is needed.
  const serialized = await serializeSignedCookie(SESSION_COOKIE, token, E2E_AUTH_SECRET);
  const value = serialized.slice(SESSION_COOKIE.length + 1).split(";")[0]!;
  await context.addCookies([
    {
      name: SESSION_COOKIE,
      value,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

// Signs out and in as someone else in the same browser context. The page is left first, so a
// link prefetch still in flight from the old user's page can't race the cookie switch.
export async function switchUser(page: Page, context: BrowserContext, email: string) {
  await page.goto("about:blank");
  await context.clearCookies();
  await signInAs(context, email);
}
