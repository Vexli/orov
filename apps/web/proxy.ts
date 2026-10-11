import { createNonce, pageCsp } from "@orov/core/security/csp";
import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { getAuthSetup } from "./lib/auth-providers";

// Every route needs a session except sign-in, the health check, and the theme stylesheet and
// brand files the sign-in page is drawn with. Better Auth's routes are excluded by the matcher,
// so the callback URL can always be reached. /dev/sign-in answers 404 unless development bypass
// is on.
const PUBLIC_PATHS = new Set(["/login", "/dev/sign-in", "/api/health", "/theme.css"]);
const PUBLIC_PREFIXES = ["/api/brand-assets/"];

const isPublic = (path: string) =>
  PUBLIC_PATHS.has(path) || PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix));

// A quick check for the session cookie, so a signed-out visitor is sent to sign in before any page
// renders. It doesn't prove the session is valid: every page and route does that against the
// database through lib/session.ts, which also redirects an expired or revoked session.
export default function proxy(req: NextRequest) {
  if (isPublic(req.nextUrl.pathname) || getSessionCookie(req)) return withScriptPolicy(req);
  const target = getAuthSetup().devBypassEmail ? "/dev/sign-in" : "/login";
  return NextResponse.redirect(new URL(target, req.nextUrl));
}

// Next reads the nonce from the request's CSP header and adds it to the scripts it renders.
// API routes return no HTML and keep next.config.ts's base policy; /api/brand-assets/* sets a
// stricter one of its own that this must not replace.
function withScriptPolicy(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/api/")) return NextResponse.next();
  const csp = pageCsp(createNonce(), { dev: process.env.NODE_ENV === "development" });
  const headers = new Headers(req.headers);
  headers.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
