import type { NextRequest } from "next/server";
import { getDb } from "@orov/db/client";
import { search } from "@orov/db/queries/search";
import { getCurrentUser } from "@/lib/session";

// The ⌘K search (plan.md §7): people, teams and rooms for any signed-in user.
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const results = await search(getDb(), request.nextUrl.searchParams.get("q") ?? "");
  return Response.json(results, { headers: { "Cache-Control": "no-store" } });
}
