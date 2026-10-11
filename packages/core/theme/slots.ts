// The fixed set of semantic slots every component styles through (plan.md §9.1). Components
// never read a brand token or a Tailwind palette color directly, so a brand theme can restyle
// the whole app by changing these values alone.
//
// An imported brand theme maps its tokens onto these slots (map.ts); every slot it leaves out
// keeps the default here.

export type SlotKind =
  | "color"
  | "opacity"
  | "dimension"
  | "font-family"
  | "font-weight"
  | "density"
  | "text"
  | "asset";

export interface SlotDefinition {
  // Dotted name, as used in token mappings: "map.selection".
  name: string;
  kind: SlotKind;
  // The CSS custom property the value is emitted as. Null for slots that aren't CSS, such as
  // the app name or a logo.
  cssVar: string | null;
  light: string;
  // Only where dark mode needs a different value.
  dark?: string;
  description: string;
}

// Colors use the bare slot name (`--primary`), which is also shadcn/ui's convention. Type and
// shape slots are prefixed with `--theme-`, because `--font-sans`, `--radius-*` and `--spacing`
// are Tailwind's own theme variables and would collide.
const cssName = (name: string) => `--${name.replace(/\./g, "-")}`;

function color(name: string, light: string, dark: string, description: string): SlotDefinition {
  return { name, kind: "color", cssVar: cssName(name), light, dark, description };
}

export const TEAM_PALETTE_SIZE = 8;

const TEAM_PALETTE: [string, string][] = [
  ["#0284c7", "#38bdf8"],
  ["#16a34a", "#4ade80"],
  ["#d97706", "#fbbf24"],
  ["#9333ea", "#c084fc"],
  ["#db2777", "#f472b6"],
  ["#0d9488", "#2dd4bf"],
  ["#dc2626", "#f87171"],
  ["#4f46e5", "#818cf8"],
];

export const SLOTS: readonly SlotDefinition[] = [
  // Surface and text
  color("bg", "#ffffff", "#0a0a0a", "Page background"),
  color("fg", "#171717", "#f5f5f5", "Default text"),
  color("muted", "#f5f5f5", "#1c1c1c", "Subtle surfaces: table headers, chips, hover"),
  color("muted-fg", "#525252", "#a3a3a3", "Secondary text"),
  color("card", "#ffffff", "#0a0a0a", "Card and panel background"),
  color("card-fg", "#171717", "#f5f5f5", "Text on cards"),
  color("border", "#e5e5e5", "#2e2e2e", "Borders and dividers"),
  color("ring", "#737373", "#a3a3a3", "Focus ring"),

  // Brand
  color("primary", "#171717", "#fafafa", "Primary buttons and the selected chip"),
  color("primary-fg", "#fafafa", "#171717", "Text on primary"),
  color("accent", "#fef3c7", "#422006", "Highlighted rows and secondary emphasis"),
  color("accent-fg", "#78350f", "#fde68a", "Text on accent"),
  color("destructive", "#b91c1c", "#f87171", "Errors and destructive actions"),
  color("destructive-fg", "#ffffff", "#0a0a0a", "Text on destructive"),

  // Map
  color("map.bg", "#fafafa", "#141414", "Floor plan background"),
  color("map.selection", "#f59e0b", "#fbbf24", "Focused seat"),
  color("map.highlight", "#0284c7", "#38bdf8", "Seats of the highlighted team"),
  {
    name: "map.dim-opacity",
    kind: "opacity",
    cssVar: "--map-dim-opacity",
    light: "0.25",
    description: "Opacity outside the zoomed area",
  },
  color("room.free", "#16a34a", "#4ade80", "Meeting room free now"),
  color("room.busy", "#b91c1c", "#f87171", "Meeting room busy now"),
  color("room.soon", "#d97706", "#fbbf24", "Free now, booked within 15 minutes"),
  color("room.stale", "#6b7280", "#6b7280", "Status older than five minutes"),

  // Presence
  color("presence.in-office", "#16a34a", "#4ade80", "In the office"),
  color("presence.wfh", "#2563eb", "#60a5fa", "Working from home"),
  color("presence.away", "#6b7280", "#9ca3af", "Away (sick or vacation, masked)"),
  color("presence.vacation", "#7c3aed", "#a78bfa", "On vacation"),
  color("presence.sick", "#dc2626", "#f87171", "Out sick"),
  {
    name: "presence.absent-opacity",
    kind: "opacity",
    cssVar: "--presence-absent-opacity",
    light: "0.45",
    description: "Greying for people who are out, in the simple display mode",
  },

  // Teams without their own color
  ...TEAM_PALETTE.map(([light, dark], i) =>
    color(`team.palette.${i}`, light, dark, `Team color ${i + 1}`),
  ),

  // Type
  {
    name: "font.sans",
    kind: "font-family",
    cssVar: "--theme-font-sans",
    light: 'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"',
    description: "Body and heading font",
  },
  {
    name: "font.mono",
    kind: "font-family",
    cssVar: "--theme-font-mono",
    light: 'ui-monospace, "SFMono-Regular", "Menlo", "Consolas", "Liberation Mono", monospace',
    description: "Codes such as seat ids and slugs",
  },
  {
    name: "font.size.base",
    kind: "dimension",
    cssVar: "--theme-font-size-base",
    light: "16px",
    description: "Root font size",
  },
  {
    name: "font.weight.heading",
    kind: "font-weight",
    cssVar: "--theme-font-weight-heading",
    light: "600",
    description: "Heading weight",
  },

  // Shape and space
  {
    name: "radius.base",
    kind: "dimension",
    cssVar: "--theme-radius",
    light: "0.375rem",
    description: "Corner radius of controls and cards",
  },
  {
    name: "spacing.base",
    kind: "dimension",
    cssVar: "--theme-spacing-base",
    light: "0.25rem",
    description: "One spacing step before density",
  },
  {
    name: "density",
    kind: "density",
    cssVar: null,
    light: "comfortable",
    description: "compact tightens every spacing step",
  },

  // Brand assets. Not CSS: they feed the page metadata and header.
  {
    name: "appName",
    kind: "text",
    cssVar: null,
    light: "OrOv",
    description: "Product name in the header and title",
  },
  {
    name: "logo.light",
    kind: "asset",
    cssVar: null,
    light: "",
    description: "Logo for light backgrounds",
  },
  {
    name: "logo.dark",
    kind: "asset",
    cssVar: null,
    light: "",
    description: "Logo for dark backgrounds",
  },
  { name: "favicon", kind: "asset", cssVar: null, light: "", description: "Browser tab icon" },
];

export const DENSITY_SCALE = { comfortable: 1, compact: 0.875 } as const;

export function getSlot(name: string): SlotDefinition {
  const slot = SLOTS.find((s) => s.name === name);
  if (!slot) throw new Error(`Unknown theme slot: ${name}`);
  return slot;
}
