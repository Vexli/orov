// Reading the JSON body of a cookie-authenticated POST route handler. Server actions get Next's
// own origin check and body limit (next.config.ts); route handlers get neither, so:
//  - the body must be sent as application/json, which a cross-origin page can only do after a
//    CORS preflight this app never answers, and a sibling subdomain's form (same-site, so the
//    SameSite=Lax session cookie goes along) can't do at all;
//  - an Origin header, which browsers send with every POST, must be this app's own (AUTH_URL);
//  - the body is refused once it passes maxBytes, before it is buffered whole.

export class JsonRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function appOrigin(request: Request): string {
  try {
    return new URL(process.env.AUTH_URL ?? request.url).origin;
  } catch {
    return new URL(request.url).origin;
  }
}

// The parsed body, or null when it isn't valid JSON. Throws JsonRequestError for a request that
// must be refused outright.
export async function readJsonRequest(request: Request, maxBytes: number): Promise<unknown> {
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== appOrigin(request))
    throw new JsonRequestError("Cross-origin request refused.", 403);
  const type = request.headers.get("content-type") ?? "";
  if (!/^application\/json\s*(;|$)/i.test(type))
    throw new JsonRequestError("Send the request as application/json.", 415);

  const tooLarge = () =>
    new JsonRequestError(
      `The request is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.`,
      413,
    );
  if (Number(request.headers.get("content-length")) > maxBytes) throw tooLarge();
  if (!request.body) return null;

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw tooLarge();
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    return null;
  }
}

export function jsonRequestErrorResponse(error: JsonRequestError): Response {
  return Response.json({ error: error.message }, { status: error.status });
}
