import { NextResponse } from "next/server";

// Liveness only. Stale-job reporting (plan.md §10) comes with the worker heartbeat in Phase 4.
export function GET() {
  return NextResponse.json({ ok: true, service: "web" });
}
