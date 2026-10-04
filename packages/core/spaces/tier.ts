// What an office calls the level between itself and its areas (#16): "Floor" in a tower, but
// perhaps "Building" on a campus or "Wing" in a long single-storey office. Each office stores
// both forms, rather than guessing plurals. The data model is the same whatever the name.

export interface TierLabels {
  singular: string;
  plural: string;
}

export const DEFAULT_TIER_LABELS: TierLabels = { singular: "Floor", plural: "Floors" };

export const TIER_PRESETS: readonly TierLabels[] = [
  DEFAULT_TIER_LABELS,
  { singular: "Building", plural: "Buildings" },
  { singular: "Wing", plural: "Wings" },
  { singular: "Level", plural: "Levels" },
  { singular: "Zone", plural: "Zones" },
];

// The phrasings the UI needs, from an office's labels: "Floor", "Floors", "floor" (in a
// sentence), "floors" and "Whole floor" (the area picker's "everything" option).
export function tierLabel(
  labels: TierLabels,
  form: "singular" | "plural" | "lower" | "lowerPlural" | "whole",
): string {
  switch (form) {
    case "singular":
      return labels.singular;
    case "plural":
      return labels.plural;
    case "lower":
      return labels.singular.toLowerCase();
    case "lowerPlural":
      return labels.plural.toLowerCase();
    case "whole":
      return `Whole ${labels.singular.toLowerCase()}`;
  }
}
