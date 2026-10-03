import type { NextAuthConfig } from "next-auth";
import { getAuthSetup } from "./auth-providers";

// Edge-safe part of the Auth.js config. The proxy imports this file, so it must not import
// the database driver. The database-backed sign-in check lives in lib/auth.ts.
export function authConfig(): NextAuthConfig {
  return {
    providers: getAuthSetup().providers,
    pages: {
      signIn: "/login",
      error: "/login",
    },
    session: { strategy: "jwt" },
    callbacks: {
      // The proxy calls this. Anything that reaches here with a session is allowed through, and
      // admin checks happen per request in lib/session.ts.
      authorized({ auth }) {
        return !!auth?.user?.email;
      },
    },
  };
}
