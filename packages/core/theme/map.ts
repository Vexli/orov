import { z } from "zod";
import type { ThemeIssue, TokenType } from "./parse";
import type { ResolvedToken } from "./resolve";
import { SLOTS, type SlotDefinition, type SlotKind } from "./slots";
import { parseSlotValue } from "./validate";
import { defaultThemeValues, type ThemeValues } from "./values";

// Maps an organization's tokens onto the semantic slots (plan.md §9.1, step 2). Organizations
// name tokens their own way (`brand/blue/600`), so the mapping is suggested from names and types
// and the admin edits it. It's stored with the theme, so re-importing an updated export keeps it.

// A slot takes a token, or a value typed into the editor. A slot left out uses its default.
export type MappingEntry = { token: string } | { light: string; dark?: string };
export type SlotMapping = Record<string, MappingEntry>;

const SLOT_NAMES = new Set(SLOTS.map((s) => s.name));

export const mappingSchema = z.record(
  z.string().refine((name) => SLOT_NAMES.has(name), "Unknown slot"),
  z.union([
    z.object({ token: z.string().min(1).max(300) }).strict(),
    z.object({ light: z.string().max(300), dark: z.string().max(300).optional() }).strict(),
  ]),
);

export const COMPATIBLE_TYPES: Record<SlotKind, TokenType[]> = {
  color: ["color"],
  opacity: ["number"],
  dimension: ["dimension"],
  "font-family": ["fontFamily", "string"],
  "font-weight": ["fontWeight", "number"],
  density: ["string"],
  text: ["string"],
  // Logos and the favicon are uploads, not tokens.
  asset: [],
};

export function canMap(slot: SlotDefinition, token: ResolvedToken): boolean {
  return COMPATIBLE_TYPES[slot.kind].includes(token.type);
}

// --- Suggestions --------------------------------------------------------------------------

// Common names for each slot, as path endings. "color.background.default" ends with
// "background-default", so it is suggested for `bg`. The slot's own name always matches too,
// so a file exported from this app maps back onto itself.
const SYNONYMS: Record<string, string[]> = {
  bg: ["background", "background-default", "background-primary", "surface-default"],
  fg: ["foreground", "text", "text-default", "text-primary", "on-background"],
  muted: ["background-muted", "background-subtle", "background-secondary", "surface-subtle"],
  "muted-fg": ["muted-foreground", "text-muted", "text-subtle", "text-secondary"],
  card: ["surface", "surface-card", "background-card", "surface-raised"],
  "card-fg": ["card-foreground", "on-surface", "text-on-card"],
  border: ["border-default", "divider", "outline"],
  ring: ["focus", "focus-ring", "border-focus", "outline-focus"],
  primary: ["brand", "brand-primary", "action-primary", "primary-default"],
  "primary-fg": ["primary-foreground", "on-primary", "text-on-primary", "primary-contrast"],
  accent: ["secondary", "brand-secondary"],
  "accent-fg": ["accent-foreground", "on-accent", "on-secondary", "secondary-foreground"],
  destructive: ["danger", "error", "critical", "negative"],
  "destructive-fg": ["destructive-foreground", "on-danger", "on-error", "on-destructive"],
  "map.bg": ["map-background"],
  "map.selection": ["selection", "selected"],
  "map.highlight": ["highlight"],
  "room.free": ["success", "positive", "available"],
  "room.busy": ["busy"],
  "room.soon": ["warning", "caution"],
  "room.stale": ["disabled"],
  "font.sans": [
    "font-family-sans",
    "font-family-body",
    "font-family-base",
    "font-body",
    "font-family",
  ],
  "font.mono": ["font-family-mono", "font-family-code", "font-code"],
  "font.size.base": ["font-size-body", "font-size-md", "font-size-medium", "font-size-default"],
  "font.weight.heading": ["font-weight-heading", "font-weight-semibold", "font-weight-bold"],
  "radius.base": ["radius", "border-radius", "radius-md", "border-radius-md", "radius-default"],
  "spacing.base": ["spacing-1", "space-1", "spacing-xs"],
};

// Tokens Studio pluralizes groups ("fontFamilies", "fontWeights"). Both sides go through the
// same crude singular, so it only has to be consistent, not correct English.
const singular = (w: string) =>
  w.endsWith("ies") ? `${w.slice(0, -3)}y` : w.length > 3 && /[^s]s$/.test(w) ? w.slice(0, -1) : w;

const words = (s: string) =>
  s
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(singular);

function endsWith(path: string[], phrase: string[]): boolean {
  if (phrase.length > path.length) return false;
  return phrase.every((w, i) => path[path.length - phrase.length + i] === w);
}

// The best token for a slot: an exact slot-name path first, then the longest matching ending,
// then the shortest path. Null if nothing fits.
function suggestFor(slot: SlotDefinition, tokens: ResolvedToken[]): string | null {
  let best: { path: string; score: number; length: number } | null = null;
  const phrases = [slot.name, ...(SYNONYMS[slot.name] ?? [])].map(words);
  for (const token of tokens) {
    if (!canMap(slot, token)) continue;
    const path = words(token.path);
    let score = token.path === slot.name ? 100 : 0;
    for (const phrase of phrases)
      if (endsWith(path, phrase)) score = Math.max(score, phrase.length);
    if (score === 0) continue;
    if (!best || score > best.score || (score === best.score && path.length < best.length))
      best = { path: token.path, score, length: path.length };
  }
  return best?.path ?? null;
}

// Fills in every slot the mapping leaves out, where a token's name suggests one. Slots the admin
// already mapped are kept as they are.
export function suggestMapping(tokens: ResolvedToken[], existing: SlotMapping = {}): SlotMapping {
  const mapping: SlotMapping = { ...existing };
  for (const slot of SLOTS) {
    if (mapping[slot.name] || slot.kind === "asset") continue;
    const path = suggestFor(slot, tokens);
    if (path) mapping[slot.name] = { token: path };
  }
  return mapping;
}

// --- Applying a mapping -------------------------------------------------------------------

export interface ApplyOptions {
  // Follow the viewer's dark-mode preference. When off, the theme is light only.
  darkMode: boolean;
}

// The final, validated value of every slot. A slot whose mapped value fails the grammar is an
// error; a mapped token that no longer exists in the files falls back to the default with a
// warning, so re-importing an export that renamed a token doesn't block the admin.
export function applyMapping(
  tokens: ResolvedToken[],
  mapping: SlotMapping,
  options: ApplyOptions,
): { values: ThemeValues; issues: ThemeIssue[] } {
  const defaults = defaultThemeValues();
  const byPath = new Map(tokens.map((t) => [t.path, t]));
  const issues: ThemeIssue[] = [];
  const light: Record<string, string> = { ...defaults.light };
  const dark: Record<string, string> = { ...defaults.dark! };

  for (const slot of SLOTS) {
    const entry = mapping[slot.name];
    if (!entry) continue;

    let rawLight: unknown;
    let rawDark: unknown;
    let source: string;
    if ("token" in entry) {
      const token = byPath.get(entry.token);
      if (!token) {
        issues.push({
          severity: "warning",
          path: slot.name,
          message: `${slot.name} is mapped to {${entry.token}}, which isn't in the files. It uses the default.`,
        });
        continue;
      }
      if (!canMap(slot, token)) {
        issues.push({
          severity: "error",
          path: slot.name,
          message: `${slot.name} needs a ${slot.kind} token, but {${entry.token}} is ${token.declaredType ?? token.type}`,
        });
        continue;
      }
      rawLight = token.light ?? token.dark;
      rawDark = token.dark ?? token.light;
      source = `{${entry.token}}`;
    } else {
      rawLight = entry.light;
      rawDark = entry.dark?.trim() ? entry.dark : entry.light;
      source = "the value entered";
    }

    const l = parseSlotValue(slot.kind, rawLight);
    const d = parseSlotValue(slot.kind, rawDark);
    for (const [mode, result] of [
      ["light", l],
      ["dark", d],
    ] as const) {
      if (!result.ok)
        issues.push({
          severity: "error",
          path: slot.name,
          message: `${slot.name} (${mode}) from ${source}: ${result.error}`,
        });
    }
    if (l.ok) light[slot.name] = l.value;
    if (d.ok) dark[slot.name] = d.value;
  }

  return { values: { light, dark: options.darkMode ? dark : null }, issues };
}
