import { createLoader, parseAsBoolean, parseAsString } from "nuqs/server";

// The one definition of URL state. Every view imports it, so the same person, team and filters
// survive a switch between views (plan.md §7).
//
// Imported from nuqs/server, which has no client-only code, so server pages can parse the same
// params with a loader and client components can pass these parsers to useQueryStates.
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

// `loc` is the same param the directory filters on, so a location carries across views.
// `space` is the room or free desk picked on the map, which has no person to select.
export const mapParsers = {
  ...selectionParsers,
  loc: parseAsString,
  floor: parseAsString,
  area: parseAsString,
  space: parseAsString,
};

export const loadMapParams = createLoader(mapParsers);
