import { z } from "zod";

// Admin form schema for a team. Ids come from select boxes, so this checks shape only.
// The database layer checks that the ids exist and that the parent chain has no cycle.
const optionalText = z
  .string()
  .trim()
  .nullable()
  .transform((v) => (v === null || v === "" ? null : v));

export const teamFormSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "Use lowercase letters, digits and hyphens")),
  name: z.string().trim().min(1, "Name is required"),
  parentTeamId: z.string().nullable(),
  leadId: z.string().nullable(),
  slackChannelId: optionalText,
  color: optionalText,
});

export type TeamForm = z.infer<typeof teamFormSchema>;
