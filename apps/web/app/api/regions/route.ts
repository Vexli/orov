import type { NextRequest } from "next/server";
import { searchRegions } from "@orov/core/regions/iso3166";
import { getCurrentUser } from "@/lib/session";

// Suggestions for the region picker (Phase 6). The ISO 3166-2 list stays on the server (§7.1),
// so the picker asks here as the admin types.
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  // Labelled in the user's language; English names match too.
  const results = searchRegions(request.nextUrl.searchParams.get("q") ?? "", 20, user.locale);
  return Response.json(results, { headers: { "Cache-Control": "no-store" } });
}
