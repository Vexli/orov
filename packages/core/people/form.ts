import { z } from "zod";
import { regionCodeSchema } from "../regions/iso3166";
import { optionalTimeZoneSchema } from "../time/zones";
import { parseIdentity, PROFILE_PROVIDER_IDS, type Identities } from "./identities";
import { normalizePhone } from "./phone";

// Admin form schemas. Ids come from select boxes, so these check shape only.
// The database layer checks that the ids exist and that the write keeps the invariants.

const optionalText = z
  .string()
  .trim()
  .nullable()
  .transform((v) => (v === null || v === "" ? null : v));

const isoDate = (label: string) =>
  z
    .string()
    .trim()
    .nullable()
    .transform((v) => (v === null || v === "" ? null : v))
    .pipe(z.union([z.null(), z.iso.date(`${label} must be YYYY-MM-DD`)]));

// Profile accounts by provider id. A blank value clears that account. Issues carry the provider in
// their path (["identities", "github"]), so the form can show the error under the right input.
export const identitiesInputSchema = z
  .record(z.string(), z.string().nullable())
  .transform((raw, ctx) => {
    const identities: Identities = {};
    for (const [provider, value] of Object.entries(raw)) {
      if (!PROFILE_PROVIDER_IDS.includes(provider)) {
        ctx.addIssue({ code: "custom", message: `Unknown account type "${provider}"`, path: [provider] });
        return z.NEVER;
      }
      const result = parseIdentity(provider, value);
      if (!result.ok) {
        ctx.addIssue({ code: "custom", message: result.message, path: [provider] });
        return z.NEVER;
      }
      if (result.value !== null) identities[provider] = result.value;
    }
    return identities;
  });

export const personFormSchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")),
    givenName: z.string().trim().min(1, "Given name is required"),
    familyName: optionalText,
    preferredName: optionalText,
    title: optionalText,
    phone: optionalText,
    homeRegion: regionCodeSchema("Home region"),
    homeTimezone: optionalTimeZoneSchema(),
    startDate: isoDate("Start date"),
    endDate: isoDate("Last day"),
    active: z.boolean(),
    managerId: z.string().nullable(),
    assignedDeskId: z.string().nullable(),
    // When the chosen desk is someone else's: they take this person's old desk instead.
    swapDesk: z.boolean().optional(),
    teamIds: z.array(z.string()),
    primaryTeamId: z.string().nullable(),
    identities: identitiesInputSchema,
  })
  .refine((v) => v.startDate === null || v.endDate === null || v.endDate >= v.startDate, {
    message: "The last day can't be before the start date",
    path: ["endDate"],
  })
  .refine((v) => v.primaryTeamId === null || v.teamIds.includes(v.primaryTeamId), {
    message: "The primary team must be one of the selected teams",
    path: ["primaryTeamId"],
  })
  // The phone is read in the home region's country unless it has a country code, so it's checked
  // once the region is known.
  .transform((v, ctx) => {
    const phone = normalizePhone(v.phone, v.homeRegion);
    if (!phone.ok) {
      ctx.addIssue({ code: "custom", message: phone.message, path: ["phone"] });
      return z.NEVER;
    }
    return { ...v, phone: phone.value };
  });

export type PersonForm = z.infer<typeof personFormSchema>;

// What anyone can change about themself (#20), without an admin. Everything else (name, email,
// title, manager, desk, teams, region) stays an admin's. The phone is normalized against the
// person's home region when saved, since the form doesn't carry it.
export const selfProfileSchema = z.object({
  preferredName: optionalText,
  phone: optionalText,
  homeTimezone: optionalTimeZoneSchema(),
  identities: identitiesInputSchema,
});

export type SelfProfileForm = z.infer<typeof selfProfileSchema>;
