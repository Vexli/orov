import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { getAuthSetup } from "./auth-providers";
import { canSignIn, isBootstrapAdmin } from "@officeorg/core";
import { getDb } from "@officeorg/db/client";
import { recordSignIn } from "@officeorg/db/queries/app-users";

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}

// Lazy, so a misconfigured provider fails the first request instead of `next build`.
export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const config = authConfig();
  return {
    ...config,
    callbacks: {
      ...config.callbacks,
      async signIn({ user, account, profile }) {
        const companyDomain = process.env.COMPANY_DOMAIN;
        if (!companyDomain) throw new Error("COMPANY_DOMAIN is not set");

        // user.email is the provider's own mapping of its claims, so it is the right field for
        // every provider. The verification claims only exist on OAuth/OIDC profiles.
        const email = typeof user?.email === "string" ? user.email.toLowerCase() : null;
        if (!email || !account) return false;
        const decision = canSignIn(
          {
            provider: account.provider,
            email,
            emailVerified: profile?.email_verified as boolean | string | undefined,
            hd: typeof profile?.hd === "string" ? profile.hd : null,
          },
          companyDomain,
          { devAuth: getAuthSetup().devAuth },
        );
        if (!decision.ok) return false;

        // The sign-in record is written here, not in the JWT callback, so the app_user row exists
        // from the first request onward.
        await recordSignIn(getDb(), email, isBootstrapAdmin(email, adminEmails()));
        return true;
      },
      async jwt({ token, user }) {
        if (typeof user?.email === "string") token.email = user.email.toLowerCase();
        return token;
      },
      async session({ session, token }) {
        if (typeof token.email === "string") session.user.email = token.email;
        return session;
      },
    },
  };
});
