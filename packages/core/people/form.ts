import { z } from "zod";
import { regionCodeSchema } from "../regions/iso3166";

// Admin form schemas. Ids come from select boxes, so these check shape only.
// The database layer checks that the ids exist and that the write keeps the invariants.

const optionalText = z
  .string()
  .trim()
  .nullable()
  .transform((v) => (v === null || v === "" ? null : v));

const isoDate = z
  .string()
  .trim()
  .nullable()
  .transform((v) => (v === null || v === "" ? null : v))
  .pipe(z.union([z.null(), z.iso.date("Start date must be YYYY-MM-DD")]));

export const personFormSchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")),
    name: z.string().trim().min(1, "Name is required"),
    preferredName: optionalText,
    title: optionalText,
    phone: optionalText,
    homeRegion: regionCodeSchema("Home region"),
    homeTimezone: optionalText,
    startDate: isoDate,
    active: z.boolean(),
    managerId: z.string().nullable(),
    assignedDeskId: z.string().nullable(),
    // When the chosen desk is someone else's: they take this person's old desk instead.
    swapDesk: z.boolean().optional(),
    teamIds: z.array(z.string()),
    primaryTeamId: z.string().nullable(),
  })
  .refine((v) => v.primaryTeamId === null || v.teamIds.includes(v.primaryTeamId), {
    message: "The primary team must be one of the selected teams",
    path: ["primaryTeamId"],
  });

export type PersonForm = z.infer<typeof personFormSchema>;
