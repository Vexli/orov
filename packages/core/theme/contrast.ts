import {
  composite,
  fromLinearRgb,
  linearRgb,
  linearToOklab,
  oklabToLinear,
  parseHex,
  toHex,
  type Rgba,
  type Vec3,
} from "./color";
import type { ThemeMode, ThemeValues } from "./values";

// The contrast report for a theme (plan.md §9.1, R6). Brand palettes often fail WCAG AA, so every
// failing pair blocks saving unless the admin overrides it, and the report offers the nearest
// shade that passes.

// WCAG 2.x: 4.5:1 for body text (SC 1.4.3), 3:1 for graphical objects such as a room's fill or a
// presence badge (SC 1.4.11).
export const TEXT_CONTRAST = 4.5;
export const GRAPHIC_CONTRAST = 3;

// Room states must stay apart under color-vision deficiencies. OKLab's just-noticeable difference
// is about 0.02; three times that is a difference that holds up on a small shape on the map.
export const CVD_MIN_DELTA_E = 0.06;

// Text slots and the background each is read on.
export const TEXT_PAIRS: readonly [string, string][] = [
  ["fg", "bg"],
  ["muted-fg", "bg"],
  ["muted-fg", "muted"],
  ["card-fg", "card"],
  ["primary-fg", "primary"],
  ["accent-fg", "accent"],
  ["destructive-fg", "destructive"],
  // Error messages use the destructive color as text on the page.
  ["destructive", "bg"],
];

// Status colors, checked against both surfaces they appear on: the floor plan and cards.
export const STATUS_SLOTS = [
  "room.free",
  "room.busy",
  "room.soon",
  "room.stale",
  "presence.in-office",
  "presence.wfh",
  "presence.away",
  "presence.vacation",
  "presence.sick",
] as const;
export const STATUS_SURFACES = ["map.bg", "card"] as const;

export const ROOM_STATES = ["room.free", "room.busy", "room.soon"] as const;

export type Deficiency = "protanopia" | "deuteranopia" | "tritanopia";

// Machado, Oliveira and Fernandes (2009), severity 1.0, applied to linear RGB.
const SIMULATIONS: Record<Deficiency, [Vec3, Vec3, Vec3]> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

export type ContrastCheck =
  | {
      kind: "text" | "graphic";
      mode: ThemeMode;
      slot: string;
      against: string;
      ratio: number;
      required: number;
      pass: boolean;
      // The nearest shade of `slot` that passes. Only on a failure.
      suggestion?: string;
    }
  | {
      kind: "cvd";
      mode: ThemeMode;
      slot: string;
      against: string;
      deficiency: Deficiency;
      deltaE: number;
      required: number;
      pass: boolean;
    };

function rgba(hex: string): Rgba {
  const c = parseHex(hex);
  if (!c) throw new Error(`Not a hex color: ${hex}`);
  return c;
}

// A translucent foreground is judged as it is drawn: composited onto its background. The
// background itself is taken as drawn on white if it isn't opaque.
const WHITE: Rgba = { r: 1, g: 1, b: 1, a: 1 };

function luminance(c: Rgba): number {
  const [r, g, b] = linearRgb(c);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(fgHex: string, bgHex: string): number {
  const bg = composite(rgba(bgHex), WHITE);
  const fg = composite(rgba(fgHex), bg);
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

// The shade of `fgHex` closest in OKLab lightness that reaches `required` against `bgHex`. Hue
// and chroma are kept, so the suggestion still reads as the brand color. Null if even black or
// white fails, which only happens for a mid-grey background and a 4.5:1 target.
export function nearestPassing(fgHex: string, bgHex: string, required: number): string | null {
  const bg = composite(rgba(bgHex), WHITE);
  const [L, a, b] = linearToOklab(linearRgb(composite(rgba(fgHex), bg)));
  const passes = (hex: string) => contrastRatio(hex, toHex(bg)) >= required;
  for (let step = 1; step <= 200; step++) {
    const delta = step * 0.005;
    for (const candidateL of [L - delta, L + delta]) {
      if (candidateL < 0 || candidateL > 1) continue;
      const hex = toHex(fromLinearRgb(oklabToLinear([candidateL, a, b])));
      if (passes(hex)) return hex;
    }
  }
  return null;
}

export function simulate(hex: string, deficiency: Deficiency): Vec3 {
  const [r, g, b] = linearRgb(composite(rgba(hex), WHITE));
  return SIMULATIONS[deficiency].map(([x, y, z]) =>
    Math.min(1, Math.max(0, x * r + y * g + z * b)),
  ) as Vec3;
}

export function deltaE(a: Vec3, b: Vec3): number {
  const [p, q] = [linearToOklab(a), linearToOklab(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

const round = (n: number, digits: number) => Number(n.toFixed(digits));

function ratioCheck(
  kind: "text" | "graphic",
  mode: ThemeMode,
  colors: Record<string, string>,
  slot: string,
  against: string,
): ContrastCheck {
  const required = kind === "text" ? TEXT_CONTRAST : GRAPHIC_CONTRAST;
  const ratio = contrastRatio(colors[slot]!, colors[against]!);
  const pass = ratio >= required;
  const check: ContrastCheck = {
    kind,
    mode,
    slot,
    against,
    ratio: round(ratio, 2),
    required,
    pass,
  };
  if (!pass)
    check.suggestion = nearestPassing(colors[slot]!, colors[against]!, required) ?? undefined;
  return check;
}

// Every check, in both modes when the theme has a dark mode.
export function contrastReport(values: ThemeValues): ContrastCheck[] {
  const checks: ContrastCheck[] = [];
  const modes: [ThemeMode, Record<string, string>][] = [["light", values.light]];
  if (values.dark) modes.push(["dark", values.dark]);

  for (const [mode, colors] of modes) {
    for (const [slot, against] of TEXT_PAIRS)
      checks.push(ratioCheck("text", mode, colors, slot, against));
    for (const slot of STATUS_SLOTS)
      for (const against of STATUS_SURFACES)
        checks.push(ratioCheck("graphic", mode, colors, slot, against));
    for (const deficiency of Object.keys(SIMULATIONS) as Deficiency[]) {
      for (let i = 0; i < ROOM_STATES.length; i++) {
        for (let j = i + 1; j < ROOM_STATES.length; j++) {
          const [slot, against] = [ROOM_STATES[i]!, ROOM_STATES[j]!];
          const d = deltaE(
            simulate(colors[slot]!, deficiency),
            simulate(colors[against]!, deficiency),
          );
          checks.push({
            kind: "cvd",
            mode,
            slot,
            against,
            deficiency,
            deltaE: round(d, 3),
            required: CVD_MIN_DELTA_E,
            pass: d >= CVD_MIN_DELTA_E,
          });
        }
      }
    }
  }
  return checks;
}
