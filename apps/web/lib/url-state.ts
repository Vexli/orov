import { createLoader, parseAsBoolean, parseAsString, parseAsStringLiteral } from "nuqs/server";
import { ORG_TREES } from "@officeorg/core/org/tree";

// The one definition of URL state. Every view imports it, so the same person, team and filters
// survive a switch between views (plan.md §7).
//
// Imported from nuqs/server, which has no client-only code, so server pages can parse the same
// params with a loader and client components can pass these parsers to useQueryStates.
//
// `sub` defaults to true: a team means the team and everything under it, unless the viewer
// unticks "Include sub-teams". nuqs leaves defaults out of the URL, so only `sub=false` is written.
export const selectionParsers = {
  person: parseAsString,
  team: parseAsString,
  sub: parseAsBoolean.withDefault(true),
};

export const directoryParsers = {
  ...selectionParsers,
  q: parseAsString.withDefault(""),
  loc: parseAsString,
  desk: parseAsBoolean.withDefault(false),
};

// `loc` is the same param the directory filters on, so a location carries across views.
// `space` is the room or free desk picked on the map, which has no person to select. `view`
// switches the map to a table.
export const mapParsers = {
  ...selectionParsers,
  loc: parseAsString,
  floor: parseAsString,
  area: parseAsString,
  space: parseAsString,
  // The accessible table of the same desks and rooms (plan.md §6).
  view: parseAsStringLiteral(["map", "list"] as const).withDefault("map"),
};

export const loadMapParams = createLoader(mapParsers);

// `tree` picks the reporting tree or the team tree (plan.md §7). `view` swaps the chart for an
// outline of the same tree, for keyboards and screen readers.
export const orgParsers = {
  ...selectionParsers,
  tree: parseAsStringLiteral(ORG_TREES).withDefault("reporting"),
  view: parseAsStringLiteral(["chart", "list"] as const).withDefault("chart"),
};
