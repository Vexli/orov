import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { canSignIn, isBootstrapAdmin } from "@officeorg/core";
import { getDb } from "@officeorg/db/client";
import { recordSignIn } from "@officeorg/db/queries/app-users";

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim()).filter(Boolean);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ profile }) {
      const companyDomain = process.env.COMPANY_DOMAIN;
      if (!companyDomain) throw new Error("COMPANY_DOMAIN is not set");

      const email = typeof profile?.email === "string" ? profile.email : null;
      const decision = canSignIn(
        {
          email: email ?? "",
          email_verified: profile?.email_verified === true,
          hd: typeof profile?.hd === "string" ? profile.hd : null,
        },
        companyDomain,
      );
      if (!email || !decision.ok) return false;

      // The sign-in record is written here, not in the JWT callback, so the app_user row exists
      // from the first request onward.
      await recordSignIn(getDb(), email.toLowerCase(), isBootstrapAdmin(email, adminEmails()));
      return true;
    },
    async jwt({ token, profile }) {
      if (typeof profile?.email === "string") token.email = profile.email.toLowerCase();
      return token;
    },
    async session({ session, token }) {
      if (typeof token.email === "string") session.user.email = token.email;
      return session;
    },
  },
});
