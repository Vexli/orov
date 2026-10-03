import { ASSET_ID } from "@officeorg/core/theme/validate";
import { getDb } from "@officeorg/db/client";
import { getBrandAsset } from "@officeorg/db/queries/theme";

// Uploaded logos, favicons and fonts, served same-origin (plan.md §9.1, §10). Public, because
// the sign-in page shows the logo. Rows never change, so a response is cacheable for good.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const asset = ASSET_ID.test(id) ? await getBrandAsset(getDb(), id) : null;
  if (!asset) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(asset.bytes), {
    headers: {
      "Content-Type": asset.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: `"${asset.sha256}"`,
      "X-Content-Type-Options": "nosniff",
      // An SVG logo is sanitized on upload. If it's opened on its own, it still can't run
      // anything or load anything.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
}
