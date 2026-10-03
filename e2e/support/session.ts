import { encode } from "next-auth/jwt";
import type { BrowserContext } from "@playwright/test";
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
