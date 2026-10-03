import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

// Edge-safe part of the Auth.js config. Middleware imports this file, so it must not import
// the database driver. The database-backed sign-in check lives in lib/auth.ts.
export const authConfig = {
  providers: [
    Google({
      // Hint only. The real check is the hd claim in the signIn callback, because a hint can be
      // ignored by a client.
      authorization: {
        params: { hd: process.env.COMPANY_DOMAIN, prompt: "select_account" },
      },
    }),
  ],
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: { strategy: "jwt" },
  callbacks: {
    // Middleware calls this. Anything that reaches here with a session is allowed through, and
    // admin checks happen per request in lib/session.ts.
    authorized({ auth }) {
      return !!auth?.user?.email;
    },
  },
} satisfies NextAuthConfig;
