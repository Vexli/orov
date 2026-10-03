import { z } from "zod";

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
    homeCountry: z
      .string()
      .trim()
      .toUpperCase()
      .pipe(z.string().regex(/^[A-Z]{2}$/, "Use a two-letter country code, such as US")),
    homeTimezone: optionalText,
    startDate: isoDate,
    active: z.boolean(),
    managerId: z.string().nullable(),
    assignedDeskId: z.string().nullable(),
    teamIds: z.array(z.string()),
    primaryTeamId: z.string().nullable(),
  })
  .refine((v) => v.primaryTeamId === null || v.teamIds.includes(v.primaryTeamId), {
    message: "The primary team must be one of the selected teams",
    path: ["primaryTeamId"],
  });

export type PersonForm = z.infer<typeof personFormSchema>;
