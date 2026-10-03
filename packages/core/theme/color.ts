// Color conversions shared by the value grammar and the contrast report. Colors travel as
// lowercase hex (`#rrggbb`, or `#rrggbbaa` when not opaque); channels here are 0–1.

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export function parseHex(value: string): Rgba | null {
  const m = HEX.exec(value.trim());
  if (!m) return null;
  let digits = m[1]!;
  if (digits.length <= 4) digits = [...digits].map((d) => d + d).join("");
  const byte = (i: number) => parseInt(digits.slice(i, i + 2), 16) / 255;
  return { r: byte(0), g: byte(2), b: byte(4), a: digits.length === 8 ? byte(6) : 1 };
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function toHex(c: Rgba): string {
  const byte = (n: number) =>
    Math.round(clamp01(n) * 255)
      .toString(16)
      .padStart(2, "0");
  const alpha = Math.round(clamp01(c.a) * 255) < 255 ? byte(c.a) : "";
  return `#${byte(c.r)}${byte(c.g)}${byte(c.b)}${alpha}`;
}

// Source-over compositing of a translucent color onto an opaque background.
export function composite(fg: Rgba, bg: Rgba): Rgba {
  const a = fg.a;
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
    a: 1,
  };
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c: number) =>
  c <= 0.0031308 ? c * 12.92 : 1.055 * Math.max(0, c) ** (1 / 2.4) - 0.055;

export type Vec3 = [number, number, number];

export function linearRgb(c: Rgba): Vec3 {
  return [toLinear(c.r), toLinear(c.g), toLinear(c.b)];
}

export function fromLinearRgb([r, g, b]: Vec3): Rgba {
  return { r: clamp01(fromLinear(r)), g: clamp01(fromLinear(g)), b: clamp01(fromLinear(b)), a: 1 };
}

// OKLab (Björn Ottosson, 2020): perceptually even enough that a straight-line distance is a fair
// measure of how different two colors look, and lightness can be changed without shifting hue.
export function linearToOklab([r, g, b]: Vec3): Vec3 {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function oklabToLinear([L, a, b]: Vec3): Vec3 {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
