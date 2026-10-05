import { getCurrentUser } from "@/lib/session";
import { getDb } from "@orov/db/client";
import { exportPeopleCsv } from "@orov/db/queries/import";

export async function GET() {
  const user = await getCurrentUser();
  if (user?.role !== "admin") return new Response("Forbidden", { status: 403 });

  const csv = await exportPeopleCsv(getDb());
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="people.csv"',
      "Cache-Control": "no-store",
    },
  });
}
