import { describe, expect, it } from "vitest";
import { checkBrandAsset, fontMetaSchema, MAX_FONT_BYTES, MAX_IMAGE_BYTES } from "./assets";

const bytes = (...b: number[]) => new Uint8Array(b);
const text = (s: string) => new TextEncoder().encode(s);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0);
const WOFF2 = bytes(0x77, 0x4f, 0x46, 0x32, 0, 1);

describe("checkBrandAsset", () => {
  it("decides the type from the first bytes", () => {
    expect(checkBrandAsset("logo_light", PNG)).toEqual({ ok: true, mime: "image/png" });
    expect(checkBrandAsset("favicon", text('<svg viewBox="0 0 1 1"/>'))).toEqual({
      ok: true,
      mime: "image/svg+xml",
    });
    expect(
      checkBrandAsset(
        "logo_dark",
        text('\uFEFF<?xml version="1.0"?>\n<!-- Acme -->\n<!DOCTYPE svg>\n<svg>'),
      ),
    ).toEqual({ ok: true, mime: "image/svg+xml" });
    expect(checkBrandAsset("font", WOFF2)).toEqual({ ok: true, mime: "font/woff2" });
  });

  it("refuses a file whose content doesn't match, whatever it's called", () => {
    expect(checkBrandAsset("logo_light", text("<html><svg></svg></html>")).ok).toBe(false);
    expect(checkBrandAsset("logo_light", WOFF2).ok).toBe(false);
    expect(checkBrandAsset("font", PNG).ok).toBe(false);
    // WOFF 1 and TrueType aren't accepted; WOFF2 is what every supported browser reads.
    expect(checkBrandAsset("font", bytes(0x77, 0x4f, 0x46, 0x46)).ok).toBe(false);
    expect(checkBrandAsset("logo_light", new Uint8Array()).ok).toBe(false);
  });

  it("caps fonts at 2 MB and images at 1 MB", () => {
    const big = (head: Uint8Array, size: number) => {
      const b = new Uint8Array(size);
      b.set(head);
      return b;
    };
    expect(checkBrandAsset("font", big(WOFF2, MAX_FONT_BYTES)).ok).toBe(true);
    expect(checkBrandAsset("font", big(WOFF2, MAX_FONT_BYTES + 1)).ok).toBe(false);
    expect(checkBrandAsset("logo_light", big(PNG, MAX_IMAGE_BYTES + 1)).ok).toBe(false);
  });
});

describe("fontMetaSchema", () => {
  it("accepts a family, weight and style from a form", () => {
    expect(fontMetaSchema.parse({ family: " Acme Sans ", weight: "700", style: "italic" })).toEqual(
      {
        family: "Acme Sans",
        weight: 700,
        style: "italic",
      },
    );
  });

  it("refuses a family name that could break out of CSS", () => {
    expect(fontMetaSchema.safeParse({ family: 'A"}', weight: 400, style: "normal" }).success).toBe(
      false,
    );
  });
});
