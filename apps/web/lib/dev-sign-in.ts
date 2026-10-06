import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";

// Development sign-in (AUTH_DEV_PASSWORD, AUTH_DEV_BYPASS_EMAIL) as a Better Auth plugin. lib/auth.ts
// registers it only when devAuthAllowed(), and its endpoint is server-only: the login page's
// server actions call it, and it isn't reachable under /api/auth. The user is created with the
// method as its provisioning source, so user.validateUserInfo runs canSignIn on it like any other
// sign-in, and the session goes through the same admitSession hook.

export type DevSignInMethod = "dev-password" | "dev-bypass";

export interface DevSignInBody {
  method: DevSignInMethod;
  email?: string;
  password?: string;
}

export function devSignIn(options: { password: string | null; bypassEmail: string | null }) {
  return {
    id: "dev-sign-in",
    endpoints: {
      devSignIn: createAuthEndpoint.serverOnly({ method: "POST" }, async (ctx) => {
        const body = (ctx.body ?? {}) as Partial<DevSignInBody>;
        let email: string | null = null;
        if (body.method === "dev-password" && options.password) {
          // Same message for an unknown email and a wrong password.
          if (body.password !== options.password)
            throw new APIError("UNAUTHORIZED", { code: "CredentialsSignin" });
          email = typeof body.email === "string" ? body.email.trim().toLowerCase() : null;
        } else if (body.method === "dev-bypass" && options.bypassEmail) {
          email = options.bypassEmail;
        }
        if (!email) throw new APIError("BAD_REQUEST", { code: "Configuration" });

        const adapter = ctx.context.internalAdapter;
        const user =
          (await adapter.findUserByEmail(email))?.user ??
          (await adapter.createUser(
            { email, name: email, emailVerified: true },
            { method: body.method! },
          ));
        const session = await adapter.createSession(user.id);
        await setSessionCookie(ctx, { session, user });
        return ctx.json({ ok: true });
      }),
    },
  } satisfies BetterAuthPlugin;
}
