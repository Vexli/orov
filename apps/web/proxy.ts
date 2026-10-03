import NextAuth from "next-auth";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { authConfig } from "./lib/auth.config";
import { getAuthSetup } from "./lib/auth-providers";

// Every route needs a session except sign-in, the health check, and the theme stylesheet and
// brand files the sign-in page is drawn with. Auth.js routes are excluded by the matcher, so the
// callback URL can always be reached. /dev/sign-in answers 404 unless development bypass is on.
const PUBLIC_PATHS = new Set(["/login", "/dev/sign-in", "/api/health", "/theme.css"]);
const PUBLIC_PREFIXES = ["/api/brand-assets/"];

const isPublic = (path: string) =>
  PUBLIC_PATHS.has(path) || PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix));

const { auth } = NextAuth(authConfig);

// With a lazy config, auth(handler) resolves to the middleware instead of returning it, and
// Next requires the default export to be a function.
const handler = auth((req) => {
  if (isPublic(req.nextUrl.pathname)) return NextResponse.next();
  if (!req.auth) {
    const target = getAuthSetup().devBypassEmail ? "/dev/sign-in" : "/login";
    return NextResponse.redirect(new URL(target, req.nextUrl));
  }
  return NextResponse.next();
}) as unknown as Promise<(req: NextRequest, event: NextFetchEvent) => Promise<Response>>;

export default async function proxy(req: NextRequest, event: NextFetchEvent) {
  return (await handler)(req, event);
}

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
