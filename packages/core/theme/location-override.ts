import { z } from "zod";
import { contrastReport, type ContrastCheck } from "./contrast";
import { getSlot } from "./slots";
import { parseSlotValue } from "./validate";
import type { ThemeValues } from "./values";

// An office's own map colors (Phase 6): a few map slots that differ from the organization's
// theme while that office's floors are on the map. Everything else in the app keeps the active
// theme, so an override can't restyle the shell, the directory or the org chart.

export const LOCATION_THEME_SLOTS = [
  "map.bg",
  "map.selection",
  "map.highlight",
  "map.dim-opacity",
  "room.free",
  "room.busy",
  "room.soon",
  "room.stale",
] as const;
export type LocationThemeSlot = (typeof LOCATION_THEME_SLOTS)[number];

// Values by mode. A slot set only for light uses the same value in dark, as a single-mode token
// does in an imported theme. Stored as location.map_theme; null means no override.
export interface LocationTheme {
  light: Partial<Record<LocationThemeSlot, string>>;
  dark: Partial<Record<LocationThemeSlot, string>>;
}

const isSlot = (name: string): name is LocationThemeSlot =>
  (LOCATION_THEME_SLOTS as readonly string[]).includes(name);

// Every value goes through the theme's value grammar (validate.ts), so nothing reaches CSS
// verbatim. Blank values are dropped, and an override with nothing left is null.
const modeSchema = z.record(z.string(), z.string()).transform((raw, ctx) => {
  const out: Partial<Record<LocationThemeSlot, string>> = {};
  for (const [name, value] of Object.entries(raw)) {
    if (!isSlot(name)) {
      ctx.addIssue({ code: "custom", message: `${name} can't be set per office`, path: [name] });
      continue;
    }
    if (value.trim() === "") continue;
    const parsed = parseSlotValue(getSlot(name).kind, value.trim());
    if (parsed.ok) out[name] = parsed.value;
    else ctx.addIssue({ code: "custom", message: `${name}: ${parsed.error}`, path: [name] });
  }
  return out;
});

export const locationThemeSchema = z
  .object({ light: modeSchema, dark: modeSchema.default({}) })
  .transform((t): LocationTheme | null =>
    Object.keys(t.light).length + Object.keys(t.dark).length === 0 ? null : t,
  );

export function overriddenSlots(override: LocationTheme): LocationThemeSlot[] {
  return LOCATION_THEME_SLOTS.filter((s) => s in override.light || s in override.dark);
}

// The theme as the office's map sees it. A light-only theme ignores dark values.
export function withLocationTheme(theme: ThemeValues, override: LocationTheme | null): ThemeValues {
  if (!override) return theme;
  const light = { ...theme.light, ...override.light };
  if (!theme.dark) return { light, dark: null };
  // A slot overridden only for light keeps that value in dark too.
  const dark = { ...theme.dark, ...override.light, ...override.dark };
  return { light, dark };
}

// The theme's contrast checks that an override can change: those that involve a slot it sets.
// The same rules as the Branding page, so an office can't make room status unreadable.
export function locationThemeReport(
  theme: ThemeValues,
  override: LocationTheme | null,
): ContrastCheck[] {
  if (!override) return [];
  const slots = new Set<string>(overriddenSlots(override));
  return contrastReport(withLocationTheme(theme, override)).filter(
    (c) => slots.has(c.slot) || slots.has(c.against),
  );
}

const SCOPE_ID = /^[A-Za-z0-9_-]{1,64}$/;

// The override as CSS custom properties on the element marked data-location-theme="<id>". The
// app's Tailwind theme reads slots through `@theme inline`, so utilities resolve the variables
// where they're used and pick up these scoped values. Values are re-parsed here, so a row edited
// by hand can't inject CSS. Empty when there's nothing to emit.
export function emitLocationThemeCss(
  locationId: string,
  theme: ThemeValues,
  override: LocationTheme | null,
): string {
  if (!override || !SCOPE_ID.test(locationId)) return "";
  const decls = (mode: Partial<Record<LocationThemeSlot, string>>, indent: string) =>
    LOCATION_THEME_SLOTS.flatMap((name) => {
      const raw = mode[name];
      if (raw === undefined) return [];
      const slot = getSlot(name);
      const parsed = parseSlotValue(slot.kind, raw);
      return parsed.ok && slot.cssVar ? [`${indent}${slot.cssVar}: ${parsed.value};`] : [];
    });
  const selector = `[data-location-theme="${locationId}"]`;
  const light = decls(override.light, "  ");
  const out: string[] = [];
  if (light.length > 0) out.push(`${selector} {`, ...light, "}");
  if (theme.dark) {
    const dark = decls({ ...override.light, ...override.dark }, "    ");
    if (dark.length > 0)
      out.push("@media (prefers-color-scheme: dark) {", `  ${selector} {`, ...dark, "  }", "}");
  }
  return out.join("\n");
}
