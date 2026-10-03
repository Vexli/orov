import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "./lib/auth.config";

// Every route needs a session except sign-in and the health check. Auth.js routes are excluded
// by the matcher, so the callback URL can always be reached.
const PUBLIC_PATHS = new Set(["/login", "/api/health"]);

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  if (PUBLIC_PATHS.has(req.nextUrl.pathname)) return NextResponse.next();
  if (!req.auth) {
    const loginUrl = new URL("/login", req.nextUrl);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
