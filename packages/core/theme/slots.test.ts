import { describe, expect, it } from "vitest";
import { SLOTS, TEAM_PALETTE_SIZE } from "./slots";
import { parseSlotValue } from "./validate";

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

  it("keeps every default in the canonical form its own grammar produces", () => {
    for (const slot of SLOTS) {
      for (const value of [slot.light, slot.dark ?? slot.light]) {
        expect(parseSlotValue(slot.kind, value), slot.name).toEqual({ ok: true, value });
      }
    }
  });
});
