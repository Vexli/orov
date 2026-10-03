import { parseHex } from "./color";
import { SLOTS, type SlotDefinition } from "./slots";
import type { ThemeValues } from "./values";

// Writes a theme as one W3C DTCG token file (plan.md §9 "Branding": export). Token paths are the
// slot names, so importing the file maps every token back onto its slot by name. Dark values go
// in `$extensions.mode`, which the importer reads. Logos, the favicon and fonts are uploads, not
// tokens, so they aren't included.

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

const round = (n: number) => Number(n.toFixed(4));

function tokenValue(slot: SlotDefinition, css: string): Json {
  switch (slot.kind) {
    case "color": {
      const c = parseHex(css)!;
      const value: { [key: string]: Json } = {
        colorSpace: "srgb",
        components: [round(c.r), round(c.g), round(c.b)],
        hex: css.slice(0, 7),
      };
      if (c.a < 1) value.alpha = round(c.a);
      return value;
    }
    case "dimension": {
      const m = /^([\d.]+)(px|rem)$/.exec(css)!;
      return { value: Number(m[1]), unit: m[2]! };
    }
    case "opacity":
    case "font-weight":
      return Number(css);
    case "font-family":
      return css.split(", ").map((name) => name.replace(/^"(.*)"$/, "$1"));
    default:
      return css;
  }
}

const DTCG_TYPE: Partial<Record<SlotDefinition["kind"], string>> = {
  color: "color",
  dimension: "dimension",
  opacity: "number",
  "font-weight": "fontWeight",
  "font-family": "fontFamily",
};

export function exportThemeTokens(values: ThemeValues, description?: string): Record<string, Json> {
  const root: { [key: string]: Json } = {};
  if (description) root.$description = description;
  for (const slot of SLOTS) {
    if (slot.kind === "asset") continue;
    const light = values.light[slot.name]!;
    const token: { [key: string]: Json } = {};
    const type = DTCG_TYPE[slot.kind];
    if (type) token.$type = type;
    token.$value = tokenValue(slot, light);
    const dark = values.dark?.[slot.name];
    if (dark !== undefined && dark !== light)
      token.$extensions = {
        mode: { light: tokenValue(slot, light), dark: tokenValue(slot, dark) },
      };

    // "map.dim-opacity" becomes { map: { "dim-opacity": … } }.
    const parts = slot.name.split(".");
    let group = root;
    for (const part of parts.slice(0, -1)) {
      group[part] ??= {};
      group = group[part] as { [key: string]: Json };
    }
    group[parts.at(-1)!] = token;
  }
  return root;
}
