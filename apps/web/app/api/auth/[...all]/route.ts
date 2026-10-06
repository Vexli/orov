import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";

// Better Auth's routes: OAuth redirects and callbacks (/api/auth/callback/<provider>), session and
// sign-out. Built per request, so the build needs no runtime configuration.
export async function GET(request: Request) {
  return toNextJsHandler(getAuth()).GET(request);
}

export async function POST(request: Request) {
  return toNextJsHandler(getAuth()).POST(request);
}
