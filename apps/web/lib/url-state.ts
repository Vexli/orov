import { parseAsBoolean, parseAsString } from "nuqs";

// The one definition of URL state. Every view imports it, so the same person, team and filters
// survive a switch between views (plan.md §7).
export const selectionParsers = {
  person: parseAsString,
  team: parseAsString,
  sub: parseAsBoolean.withDefault(false),
};

export const directoryParsers = {
  ...selectionParsers,
  q: parseAsString.withDefault(""),
  loc: parseAsString,
  desk: parseAsBoolean.withDefault(false),
};
