import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { assertStrongAuthSecret, canSignIn, signInIdentity } from "@orov/core/auth/policy";
import { getDb } from "@orov/db/client";
import { admitSession } from "@orov/db/queries/app-users";
import { authAccount, authSession, authUser, authVerification } from "@orov/db/schema";
import { getAuthSetup } from "./auth-providers";
import { devSignIn } from "./dev-sign-in";

// Sign-in on Better Auth. Sessions live in the database (auth_session), so signing out ends a
// session everywhere at once. Roles and settings are not Better Auth's: they stay on app_user,
// read on every request by lib/session.ts.
//
// Two checks guard every sign-in:
//  - user.validateUserInfo runs canSignIn (packages/core/auth/policy.ts) with the provider's own
//    claims, on every provider sign-in, new or returning, and when a development user is created;
//  - the session.create.before hook, admitSession, re-checks the email domain for every method
//    and records the sign-in (creating the app_user row, bootstrapping ADMIN_EMAILS).

function companyDomain(): string {
  const domain = process.env.COMPANY_DOMAIN;
  if (!domain) throw new Error("COMPANY_DOMAIN is not set");
  return domain.toLowerCase();
}

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}

// The login page shows a message for each of these (app/login/page.tsx).
export const SIGN_IN_ERROR = {
  accessDenied: "AccessDenied",
  credentials: "CredentialsSignin",
  configuration: "Configuration",
} as const;

function buildAuth() {
  const setup = getAuthSetup();
  const domain = companyDomain();
  return betterAuth({
    appName: "OrOv",
    baseURL: process.env.AUTH_URL,
    // Checked in production only, so a local checkout runs with whatever .env.local has.
    secret:
      process.env.NODE_ENV === "production"
        ? assertStrongAuthSecret(process.env.AUTH_SECRET)
        : process.env.AUTH_SECRET,
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: {
        auth_user: authUser,
        auth_session: authSession,
        auth_account: authAccount,
        auth_verification: authVerification,
      },
    }),
    user: {
      modelName: "auth_user",
      validateUserInfo: ({ user, source }) => {
        const decision = canSignIn(signInIdentity(user.email, source), domain, {
          devAuth: setup.devAuth,
          trustOidcEmail: setup.trustOidcEmail,
        });
        return decision.ok ? undefined : { error: SIGN_IN_ERROR.accessDenied };
      },
    },
    session: {
      modelName: "auth_session",
      // A day without use ends a session, and use extends it at most hourly. Access itself is
      // re-checked on every request (lib/session.ts), so disabling a user or marking them
      // inactive takes effect at once; this bounds how long a forgotten browser stays signed in.
      expiresIn: 60 * 60 * 24,
      updateAge: 60 * 60,
    },
    account: {
      modelName: "auth_account",
      // OrOv never calls a provider's API, but Better Auth keeps the tokens it was given.
      encryptOAuthTokens: true,
      // A sign-in whose email already has a user (another provider, or the same provider after
      // the account was recreated) joins that user only when the provider says the email is
      // verified. No provider is trusted to skip that: the email decides who someone is here,
      // and a tenant-pinned provider can still issue an email its user typed in (Entra's
      // `email` claim). Otherwise Better Auth refuses with account_not_linked.
      accountLinking: { enabled: true },
    },
    verification: { modelName: "auth_verification" },
    emailAndPassword: { enabled: false },
    socialProviders: setup.google
      ? {
          // hd is both the account-picker hint and a check of the id token's hd claim.
          google: { ...setup.google, hd: domain, prompt: "select_account" },
        }
      : {},
    databaseHooks: {
      session: {
        create: {
          before: async (session) =>
            admitSession(getDb(), session.userId, {
              companyDomain: domain,
              adminEmails: adminEmails(),
            }),
        },
      },
    },
    plugins: [
      ...(setup.genericOAuth.length > 0 ? [genericOAuth({ config: setup.genericOAuth })] : []),
      ...(setup.devAuth
        ? [devSignIn({ password: setup.devPassword, bypassEmail: setup.devBypassEmail })]
        : []),
      // Last, so cookies set by server actions reach the browser.
      nextCookies(),
    ],
    telemetry: { enabled: false },
  });
}

let instance: ReturnType<typeof buildAuth> | undefined;

// Built on first use rather than at import, because `next build` runs without the runtime
// environment, and a misconfigured provider should fail the first request, not the build.
export function getAuth() {
  instance ??= buildAuth();
  return instance;
}
