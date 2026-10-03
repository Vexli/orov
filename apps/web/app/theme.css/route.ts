import type { NextRequest } from "next/server";
import { getCurrentTheme } from "@/lib/theme";

// The active theme as a stylesheet (plan.md §9.1). Public, because the sign-in page is themed
// too. The root layout links it as /theme.css?v=<hash>, and that exact URL can be cached for
// good: a new theme gets a new hash, so a new URL. Any other request revalidates by ETag.
export async function GET(request: NextRequest) {
  const theme = await getCurrentTheme();
  const etag = `"${theme.sha256}"`;
  const current = request.nextUrl.searchParams.get("v") === theme.sha256.slice(0, 16);
  const headers = {
    "Content-Type": "text/css; charset=utf-8",
    ETag: etag,
    "Cache-Control": current ? "public, max-age=31536000, immutable" : "no-cache",
    "X-Content-Type-Options": "nosniff",
  };
  if (request.headers.get("if-none-match") === etag)
    return new Response(null, { status: 304, headers });
  return new Response(theme.css, { headers });
}
