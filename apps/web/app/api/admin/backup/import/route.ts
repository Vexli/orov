import { decryptExport, ExportFileError } from "@orov/core/backup/crypto";
import { getDb } from "@orov/db/client";
import { applyImport, planImport, type ImportMode } from "@orov/db/queries/backup";
import { ValidationError } from "@orov/db/queries/errors";
import { jsonRequestErrorResponse, JsonRequestError, readJsonRequest } from "@/lib/json-request";
import { getCurrentUser } from "@/lib/session";

// Room for every drawing version, font and logo of a large organization, encrypted and base64'd.
const MAX_IMPORT_BYTES = 128 * 1024 * 1024;

// Previews (apply: false) or applies an encrypted organization file (#29). A route handler rather
// than a server action: a file with drawings and fonts can be larger than the actions' body limit.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (user?.role !== "admin") return new Response("Forbidden", { status: 403 });
  let body;
  try {
    body = await readJsonRequest(request, MAX_IMPORT_BYTES);
  } catch (error) {
    if (error instanceof JsonRequestError) return jsonRequestErrorResponse(error);
    throw error;
  }
  const input = body as {
    file?: unknown;
    passphrase?: unknown;
    mode?: unknown;
    applyRoles?: unknown;
    apply?: unknown;
  } | null;
  if (!input || typeof input.file !== "string" || typeof input.passphrase !== "string") {
    return Response.json({ error: "Choose a file and enter its passphrase." }, { status: 400 });
  }
  const mode: ImportMode = input.mode === "replace" ? "replace" : "merge";
  try {
    const json = decryptExport(input.file, input.passphrase);
    const plan =
      input.apply === true
        ? await applyImport(getDb(), user.email, json, {
            mode,
            applyRoles: input.applyRoles === true,
          })
        : await planImport(getDb(), json, mode);
    return Response.json(
      { plan, applied: input.apply === true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof ExportFileError || error instanceof ValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
