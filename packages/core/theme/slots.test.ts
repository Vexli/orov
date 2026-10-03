import { describe, expect, it } from "vitest";
import { defaultThemeCss, getSlot, SLOTS, TEAM_PALETTE_SIZE } from "./slots";

// The slot table in plan.md §9.1. A brand mapping targets these names, so they must all exist.
const PLAN_SLOTS = [
  "bg",
  "fg",
  "muted",
  "muted-fg",
  "card",
  "card-fg",
  "border",
  "ring",
  "primary",
  "primary-fg",
  "accent",
  "accent-fg",
  "destructive",
  "destructive-fg",
  "map.bg",
  "map.selection",
  "map.highlight",
  "map.dim-opacity",
  "room.free",
  "room.busy",
  "room.soon",
  "room.stale",
  "presence.in-office",
  "presence.wfh",
  "presence.away",
  "presence.vacation",
  "presence.sick",
  "presence.absent-opacity",
  "font.sans",
  "font.mono",
  "font.size.base",
  "font.weight.heading",
  "radius.base",
  "spacing.base",
  "density",
  "appName",
  "logo.light",
  "logo.dark",
  "favicon",
];

// WCAG 2.x relative luminance and contrast ratio. Only the default palette is checked here;
// the full contrast report for imported themes is part of the branding work.
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const value = (name: string, mode: "light" | "dark") => {
  const slot = getSlot(name);
  return mode === "dark" ? (slot.dark ?? slot.light) : slot.light;
};

describe("SLOTS", () => {
  it("defines every slot named in the plan", () => {
    const names = new Set(SLOTS.map((s) => s.name));
    for (const name of PLAN_SLOTS) expect(names, name).toContain(name);
    for (let i = 0; i < TEAM_PALETTE_SIZE; i++) expect(names).toContain(`team.palette.${i}`);
  });

  it("has unique names and CSS variables", () => {
    const names = SLOTS.map((s) => s.name);
    const vars = SLOTS.flatMap((s) => (s.cssVar ? [s.cssVar] : []));
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(vars).size).toBe(vars.length);
  });

  it("never emits a variable in one of Tailwind's own theme namespaces", () => {
    const tailwind =
      /^--(color|font|text|font-weight|radius|spacing|shadow|breakpoint|container)(-|$)/;
    for (const slot of SLOTS) {
      if (slot.cssVar) expect(slot.cssVar, slot.name).not.toMatch(tailwind);
    }
  });

  it("gives every color slot a six-digit hex value in both modes", () => {
    for (const slot of SLOTS.filter((s) => s.kind === "color")) {
      expect(slot.light, slot.name).toMatch(/^#[0-9a-f]{6}$/);
      expect(slot.dark, slot.name).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  describe.each(["light", "dark"] as const)("default %s palette", (mode) => {
    it.each([
      ["fg", "bg"],
      ["muted-fg", "bg"],
      ["muted-fg", "muted"],
      ["card-fg", "card"],
      ["primary-fg", "primary"],
      ["accent-fg", "accent"],
      ["destructive-fg", "destructive"],
      ["destructive", "bg"],
    ])("%s on %s meets WCAG AA for body text", (fg, bg) => {
      expect(contrast(value(fg, mode), value(bg, mode))).toBeGreaterThanOrEqual(4.5);
    });
  });
});

describe("defaultThemeCss", () => {
  const css = defaultThemeCss();

  it("declares every CSS slot on :root", () => {
    for (const slot of SLOTS) {
      if (slot.cssVar) expect(css).toContain(`  ${slot.cssVar}: ${slot.light};`);
    }
  });

  it("puts dark overrides under the system dark-mode preference", () => {
    const dark = css.slice(css.indexOf("@media (prefers-color-scheme: dark)"));
    expect(dark).toContain("--bg: #0a0a0a;");
    expect(dark).not.toContain("--theme-radius");
  });

  it("derives the spacing step from the base and the density", () => {
    expect(css).toContain("--theme-spacing: calc(var(--theme-spacing-base) * 1);");
  });
});
