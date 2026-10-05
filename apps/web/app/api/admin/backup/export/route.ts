import { encryptExport, ExportFileError } from "@orov/core/backup/crypto";
import { getDb } from "@orov/db/client";
import { exportOrganizationAudited } from "@orov/db/queries/backup";
import { getCurrentUser } from "@/lib/session";

// The whole organization as one passphrase-encrypted file (#29). POST, so the passphrase never
// appears in a URL or a log. Admins only.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (user?.role !== "admin") return new Response("Forbidden", { status: 403 });
  const { passphrase } = (await request.json().catch(() => ({}))) as { passphrase?: unknown };
  if (typeof passphrase !== "string") return Response.json({ error: "Enter a passphrase." }, { status: 400 });

  let file;
  try {
    const exported = await exportOrganizationAudited(getDb(), user.email);
    file = encryptExport(JSON.stringify(exported), passphrase);
  } catch (error) {
    if (error instanceof ExportFileError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
  const day = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(file), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="orov-export-${day}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
