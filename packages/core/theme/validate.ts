import { z } from "zod";
import { parseHex, toHex, type Rgba } from "./color";
import type { SlotKind } from "./slots";

// The strict value grammar for theme slots (plan.md §9.1, §10). Every value a theme supplies,
// from a token file or typed into the mapping editor, is parsed here into a canonical string
// built only from characters this file chose. Raw input is never written into CSS, so a token
// file can't inject a rule, a url() or a closing brace.

export type SlotValueResult = { ok: true; value: string } | { ok: false; error: string };

const num = (n: number) => String(Number(n.toFixed(4)));

// --- Colors -------------------------------------------------------------------------------

const channel = z.union([z.number(), z.literal("none").transform(() => 0)]);

// DTCG 2025.10 color objects. Figma's and Penpot's exports use sRGB and also carry a hex.
const dtcgColor = z.object({
  colorSpace: z.string(),
  components: z.array(channel).length(3),
  alpha: z.number().min(0).max(1).optional(),
  hex: z.string().optional(),
});

function hsl(h: number, s: number, l: number, a: number): Rgba {
  const k = (n: number) => (n + h / 30) % 12;
  const f = (n: number) =>
    l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return { r: f(0), g: f(8), b: f(4), a };
}

// rgb()/rgba()/hsl()/hsla(), with comma or space syntax and an optional `/ alpha`.
const FUNCTIONAL = /^(rgba?|hsla?)\(\s*([^()]*)\)$/i;
const NUMBER = /^(-?\d*\.?\d+)(%|deg)?$/;

function parseFunctional(value: string): Rgba | null {
  const m = FUNCTIONAL.exec(value);
  if (!m) return null;
  const parts = m[2]!
    .replace(/\s*\/\s*/, " / ")
    .split(/\s*,\s*|\s+/)
    .filter((p) => p && p !== "/");
  if (parts.length < 3 || parts.length > 4) return null;
  const parsed = parts.map((p) => NUMBER.exec(p));
  if (parsed.some((p) => !p)) return null;
  const n = (i: number) => Number(parsed[i]![1]);
  const unit = (i: number) => parsed[i]![2];
  const alpha = parts.length === 4 ? (unit(3) === "%" ? n(3) / 100 : n(3)) : 1;
  if (alpha < 0 || alpha > 1) return null;

  if (m[1]!.toLowerCase().startsWith("rgb")) {
    const c = [0, 1, 2].map((i) => (unit(i) === "%" ? n(i) / 100 : n(i) / 255));
    if (c.some((v) => v < 0 || v > 1)) return null;
    return { r: c[0]!, g: c[1]!, b: c[2]!, a: alpha };
  }
  const [h, s, l] = [((n(0) % 360) + 360) % 360, n(1) / 100, n(2) / 100];
  if (s < 0 || s > 1 || l < 0 || l > 1) return null;
  return hsl(h, s, l, alpha);
}

export function parseColor(raw: unknown): SlotValueResult {
  if (typeof raw === "string") {
    const c = parseHex(raw) ?? parseFunctional(raw.trim());
    return c
      ? { ok: true, value: toHex(c) }
      : { ok: false, error: `"${clip(raw)}" isn't a color. Use hex, rgb() or hsl().` };
  }
  const obj = dtcgColor.safeParse(raw);
  if (!obj.success) return { ok: false, error: "Expected a color" };
  const { colorSpace, components, alpha = 1, hex } = obj.data;
  const [x, y, z_] = components as [number, number, number];
  let c: Rgba | null = null;
  if (colorSpace === "srgb" && [x, y, z_].every((v) => v >= 0 && v <= 1))
    c = { r: x, g: y, b: z_, a: alpha };
  else if (colorSpace === "hsl") c = hsl(((x % 360) + 360) % 360, y / 100, z_ / 100, alpha);
  else if (hex) {
    const fallback = parseHex(hex);
    if (fallback) c = { ...fallback, a: alpha };
  }
  return c
    ? { ok: true, value: toHex(c) }
    : { ok: false, error: `The ${colorSpace} color space isn't supported. Export colors as sRGB.` };
}

// --- Dimensions and numbers ---------------------------------------------------------------

const MAX = { px: 1000, rem: 64 } as const;
type Unit = keyof typeof MAX;

function dimension(value: number, unit: string): SlotValueResult {
  if (unit !== "px" && unit !== "rem")
    return { ok: false, error: `Use px or rem, not ${unit || "a bare number"}` };
  if (!Number.isFinite(value) || value < 0 || value > MAX[unit as Unit])
    return {
      ok: false,
      error: `${value}${unit} is out of range (0 to ${MAX[unit as Unit]}${unit})`,
    };
  return { ok: true, value: `${num(value)}${unit}` };
}

const DIMENSION = /^(\d*\.?\d+)(px|rem)$/;

export function parseDimension(raw: unknown): SlotValueResult {
  // A bare number is pixels, as Tokens Studio writes sizes.
  if (typeof raw === "number") return dimension(raw, "px");
  if (typeof raw === "string") {
    const t = raw.trim();
    if (t === "0") return dimension(0, "px");
    const m = DIMENSION.exec(t);
    if (m) return dimension(Number(m[1]), m[2]!);
    if (/^\d*\.?\d+$/.test(t)) return dimension(Number(t), "px");
    return { ok: false, error: `"${clip(raw)}" isn't a size. Use px or rem, such as 16px.` };
  }
  const obj = z.object({ value: z.number(), unit: z.string() }).safeParse(raw);
  return obj.success
    ? dimension(obj.data.value, obj.data.unit)
    : { ok: false, error: "Expected a size" };
}

export function parseOpacity(raw: unknown): SlotValueResult {
  let n: number | null = null;
  if (typeof raw === "number") n = raw;
  else if (typeof raw === "string") {
    const m = /^(\d*\.?\d+)(%)?$/.exec(raw.trim());
    if (m) n = m[2] ? Number(m[1]) / 100 : Number(m[1]);
  }
  if (n === null || n < 0 || n > 1)
    return { ok: false, error: "Expected an opacity from 0 to 1, or a percentage" };
  return { ok: true, value: num(n) };
}

// DTCG's named weights.
const WEIGHTS: Record<string, number> = {
  thin: 100,
  hairline: 100,
  "extra-light": 200,
  "ultra-light": 200,
  light: 300,
  normal: 400,
  regular: 400,
  book: 400,
  medium: 500,
  "semi-bold": 600,
  "demi-bold": 600,
  bold: 700,
  "extra-bold": 800,
  "ultra-bold": 800,
  black: 900,
  heavy: 900,
  "extra-black": 950,
  "ultra-black": 950,
};

// Files write these as "semi-bold", "semibold", "SemiBold" or "semi_bold".
const weightKey = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, "");
const WEIGHT_BY_KEY = new Map(Object.entries(WEIGHTS).map(([k, v]) => [weightKey(k), v]));

export function parseFontWeight(raw: unknown): SlotValueResult {
  let n: number | undefined;
  if (typeof raw === "number") n = raw;
  else if (typeof raw === "string") {
    const t = raw.trim();
    n = /^\d+$/.test(t) ? Number(t) : WEIGHT_BY_KEY.get(weightKey(t));
  }
  if (n === undefined || !Number.isInteger(n) || n < 1 || n > 1000)
    return { ok: false, error: "Expected a font weight from 1 to 1000, or a name such as bold" };
  return { ok: true, value: String(n) };
}

// --- Fonts and text -----------------------------------------------------------------------

const GENERIC_FAMILIES = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-serif",
  "ui-sans-serif",
  "ui-monospace",
  "ui-rounded",
  "math",
  "emoji",
  "fangsong",
]);

// Letters, digits, spaces and . _ - only. Real family names fit, and nothing here can end a
// quoted CSS string.
export const FAMILY_NAME = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,63}$/u;

export function parseFamilyName(raw: string): string | null {
  const name = raw
    .trim()
    .replace(/^(["'])(.*)\1$/, "$2")
    .trim();
  return FAMILY_NAME.test(name) ? name : null;
}

export function quoteFamily(name: string): string {
  return GENERIC_FAMILIES.has(name.toLowerCase()) ? name.toLowerCase() : `"${name}"`;
}

export function parseFontFamily(raw: unknown): SlotValueResult {
  const list =
    typeof raw === "string"
      ? raw.split(",")
      : Array.isArray(raw) && raw.every((x) => typeof x === "string")
        ? (raw as string[])
        : null;
  if (!list || list.length === 0 || list.length > 10)
    return { ok: false, error: "Expected a font family, or a list of up to 10" };
  const names: string[] = [];
  for (const item of list) {
    const name = parseFamilyName(item);
    if (!name) return { ok: false, error: `"${clip(item)}" isn't a valid font family name` };
    names.push(quoteFamily(name));
  }
  return { ok: true, value: names.join(", ") };
}

export function parseText(raw: unknown): SlotValueResult {
  if (typeof raw !== "string") return { ok: false, error: "Expected text" };
  const t = raw.trim();
  // No control characters; the name goes into the page title and header.
  if (t.length === 0 || t.length > 60 || /\p{Cc}/u.test(t))
    return { ok: false, error: "Expected a name of 1 to 60 characters" };
  return { ok: true, value: t };
}

// A brand_asset id, or empty for none.
export const ASSET_ID = /^ba_[a-z0-9]{8,40}$/;

export function parseAsset(raw: unknown): SlotValueResult {
  if (raw === "" || (typeof raw === "string" && ASSET_ID.test(raw)))
    return { ok: true, value: raw };
  return { ok: false, error: "Expected an uploaded file" };
}

export function parseDensity(raw: unknown): SlotValueResult {
  const t = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return t === "compact" || t === "comfortable"
    ? { ok: true, value: t }
    : { ok: false, error: "Expected compact or comfortable" };
}

const PARSERS: Record<SlotKind, (raw: unknown) => SlotValueResult> = {
  color: parseColor,
  opacity: parseOpacity,
  dimension: parseDimension,
  "font-family": parseFontFamily,
  "font-weight": parseFontWeight,
  density: parseDensity,
  text: parseText,
  asset: parseAsset,
};

export function parseSlotValue(kind: SlotKind, raw: unknown): SlotValueResult {
  return PARSERS[kind](raw);
}

function clip(s: string): string {
  return s.length > 40 ? `${s.slice(0, 37)}…` : s;
}
