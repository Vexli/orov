import { z } from "zod";
import type { PersonForm } from "./form";

// A change applied to several people at once from the admin list (#7). Each field left out is
// left alone. It's applied to each person's current form and saved through the same checks as a
// single edit, so a bulk change can't do anything an edit couldn't.
export const bulkPatchSchema = z
  .object({
    active: z.boolean().optional(),
    // Makes this the one manager of each person; null clears them, so each person gets their
    // primary team's lead (#11).
    managerId: z.string().nullable().optional(),
    addTeamIds: z.array(z.string()).optional(),
    removeTeamIds: z.array(z.string()).optional(),
    primaryTeamId: z.string().optional(),
  })
  .refine((p) => Object.values(p).some((v) => v !== undefined), "Choose a change to make");

export type BulkPatch = z.infer<typeof bulkPatchSchema>;

export function applyBulkPatch(form: PersonForm, patch: BulkPatch): PersonForm {
  const remove = new Set(patch.removeTeamIds ?? []);
  let teamIds = [...new Set([...form.teamIds, ...(patch.addTeamIds ?? [])])].filter((t) => !remove.has(t));
  let primaryTeamId = form.primaryTeamId !== null && teamIds.includes(form.primaryTeamId) ? form.primaryTeamId : null;
  if (patch.primaryTeamId !== undefined) {
    // A new primary team is joined if need be.
    if (!teamIds.includes(patch.primaryTeamId)) teamIds = [...teamIds, patch.primaryTeamId];
    primaryTeamId = patch.primaryTeamId;
  }
  return {
    ...form,
    active: patch.active ?? form.active,
    managerIds: patch.managerId === undefined ? form.managerIds : patch.managerId === null ? [] : [patch.managerId],
    teamIds,
    primaryTeamId,
    // Desks aren't part of a bulk change; never swap one by accident.
    swapDesk: false,
  };
}

// What the admin list sends: the people and the change.
export const bulkUpdateInputSchema = z.object({
  ids: z.array(z.string()).min(1, "Select at least one person"),
  patch: bulkPatchSchema,
});
