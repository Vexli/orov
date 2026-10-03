import { z } from "zod";
import { FAMILY_NAME } from "./validate";

// Checks on uploaded logos, favicons and fonts (plan.md §9.1, §10). The type is decided by the
// file's first bytes, never by its name or the browser's claim. SVGs also go through the floor
// drawing sanitizer on the server (packages/core/svg/sanitize.ts), which this module doesn't load.

export const BRAND_ASSET_KINDS = ["logo_light", "logo_dark", "favicon", "font"] as const;
export type BrandAssetKind = (typeof BRAND_ASSET_KINDS)[number];

export const MAX_FONT_BYTES = 2 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 1024 * 1024;

export type AssetMime = "image/png" | "image/svg+xml" | "font/woff2";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const WOFF2 = [0x77, 0x4f, 0x46, 0x32]; // "wOF2"

const startsWith = (bytes: Uint8Array, magic: number[]) => magic.every((b, i) => bytes[i] === b);

// An SVG is text whose first element is <svg>, after an optional BOM, XML declaration, comments
// and doctype. Only the start is read; the sanitizer judges the rest.
function looksLikeSvg(bytes: Uint8Array): boolean {
  const head = new TextDecoder("utf-8", { fatal: false })
    .decode(bytes.subarray(0, 4096))
    .replace(/^\uFEFF/, "")
    .replace(/^\s*(<\?xml[^>]*\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>|\s)*/i, "");
  return /^<svg[\s>]/i.test(head);
}

export type AssetCheck = { ok: true; mime: AssetMime } | { ok: false; error: string };

export function checkBrandAsset(kind: BrandAssetKind, bytes: Uint8Array): AssetCheck {
  if (bytes.length === 0) return { ok: false, error: "The file is empty." };
  if (kind === "font") {
    if (bytes.length > MAX_FONT_BYTES) return { ok: false, error: "Fonts are limited to 2 MB." };
    return startsWith(bytes, WOFF2)
      ? { ok: true, mime: "font/woff2" }
      : { ok: false, error: "Fonts must be WOFF2 files." };
  }
  if (bytes.length > MAX_IMAGE_BYTES)
    return { ok: false, error: "Logos and icons are limited to 1 MB." };
  if (startsWith(bytes, PNG)) return { ok: true, mime: "image/png" };
  if (looksLikeSvg(bytes)) return { ok: true, mime: "image/svg+xml" };
  return { ok: false, error: "Logos and icons must be PNG or SVG files." };
}

// What the admin says about a font when uploading it. The family is how `font.sans` and
// `font.mono` refer to it.
export const fontMetaSchema = z.object({
  family: z
    .string()
    .trim()
    .regex(FAMILY_NAME, "Use letters, digits, spaces, dots, dashes and underscores"),
  weight: z.coerce.number().int().min(1).max(1000),
  style: z.enum(["normal", "italic"]),
});
export type FontMeta = z.infer<typeof fontMetaSchema>;
