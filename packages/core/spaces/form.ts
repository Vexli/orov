import { z } from "zod";
import { regionCodeSchema } from "../regions/iso3166";
import { timeZoneSchema } from "../time/zones";
import { DEFAULT_TIER_LABELS } from "./tier";

// Admin form schemas for offices and floors. The database layer checks uniqueness and the rules
// that depend on existing rows, such as a slug that desk codes already use.

// Lowercase words joined by single hyphens. Floor slugs appear inside desk ids
// ("desk-<floor>-<n>"), so a trailing or doubled hyphen would make those ids ambiguous.
const slug = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(
    z
      .string()
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        "Use lowercase letters and digits, joined by single hyphens",
      ),
  );

const order = z.coerce.number().int("Use a whole number");

const tierName = (message: string) => z.string().trim().min(1, message).max(30, "Keep it under 30 characters");

export const locationFormSchema = z.object({
  slug,
  name: z.string().trim().min(1, "Name is required"),
  timezone: timeZoneSchema(),
  region: regionCodeSchema("Region"),
  sortOrder: order,
  // What this office calls its floors (#16). Older callers that leave them out get the default.
  floorLabelSingular: tierName("Name the level, such as Floor or Building").default(DEFAULT_TIER_LABELS.singular),
  floorLabelPlural: tierName("Give the plural, such as Floors or Buildings").default(DEFAULT_TIER_LABELS.plural),
});

export type LocationForm = z.infer<typeof locationFormSchema>;

export const floorFormSchema = z.object({
  slug,
  name: z.string().trim().min(1, "Name is required"),
  level: order,
  sortOrder: order,
});

export type FloorForm = z.infer<typeof floorFormSchema>;

// Renaming a room, point of interest or area in the app (#21). The name is what the map, cards,
// lists and search show; the drawing's id stays as it is, so re-uploading the drawing keeps the
// new name. Desks can't be renamed here: their code is how imports and the seat picker find them.
const spaceName = z.string().trim().min(1, "Name is required").max(80, "Keep it under 80 characters");

export const spaceEditSchema = z.object({
  name: spaceName,
  // Seats in a meeting room or phone booth. Blank means unknown.
  capacity: z
    .union([z.null(), z.literal(""), z.coerce.number().int("Use a whole number").min(1, "At least 1").max(1000)])
    .transform((v) => (v === "" ? null : v)),
});

export type SpaceEdit = z.infer<typeof spaceEditSchema>;

export const areaEditSchema = z.object({ name: spaceName });

export type AreaEdit = z.infer<typeof areaEditSchema>;
