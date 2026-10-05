import { decryptExport, ExportFileError } from "@orov/core/backup/crypto";
import { getDb } from "@orov/db/client";
import { applyImport, planImport, type ImportMode } from "@orov/db/queries/backup";
import { ValidationError } from "@orov/db/queries/errors";
import { getCurrentUser } from "@/lib/session";

// Previews (apply: false) or applies an encrypted organization file (#29). A route handler rather
// than a server action: a file with drawings and fonts can be larger than the actions' body limit.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (user?.role !== "admin") return new Response("Forbidden", { status: 403 });
  const body = (await request.json().catch(() => null)) as {
    file?: unknown;
    passphrase?: unknown;
    mode?: unknown;
    applyRoles?: unknown;
    apply?: unknown;
  } | null;
  if (!body || typeof body.file !== "string" || typeof body.passphrase !== "string") {
    return Response.json({ error: "Choose a file and enter its passphrase." }, { status: 400 });
  }
  const mode: ImportMode = body.mode === "replace" ? "replace" : "merge";
  try {
    const json = decryptExport(body.file, body.passphrase);
    const plan =
      body.apply === true
        ? await applyImport(getDb(), user.email, json, { mode, applyRoles: body.applyRoles === true })
        : await planImport(getDb(), json, mode);
    return Response.json({ plan, applied: body.apply === true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ExportFileError || error instanceof ValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
