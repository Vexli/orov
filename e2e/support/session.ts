import { encode } from "next-auth/jwt";
import type { BrowserContext, Page } from "@playwright/test";
import { E2E_AUTH_SECRET } from "./constants";

// Signs in by minting the JWT the app issues after a Google sign-in, using the e2e AUTH_SECRET.
// The proxy and the database role lookup then run exactly as they do in production. The Google
// round-trip can't run offline, so canSignIn is covered by its unit tests instead.
export async function signInAs(context: BrowserContext, email: string) {
  const token = await encode({
    token: { email, name: email },
    secret: E2E_AUTH_SECRET,
    salt: "authjs.session-token",
  });
  await context.addCookies([
    {
      name: "authjs.session-token",
      value: token,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

// Signs out and in as someone else in the same browser context. The page is left first: Auth.js
// refreshes the session cookie on every response, so a link prefetch still in flight from the
// old user's page would otherwise set their cookie back after the switch.
export async function switchUser(page: Page, context: BrowserContext, email: string) {
  await page.goto("about:blank");
  await context.clearCookies();
  await signInAs(context, email);
}
