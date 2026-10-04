import { describe, expect, it } from "vitest";
import { applyBulkPatch, bulkPatchSchema } from "./bulk";
import type { PersonForm } from "./form";

const bob: PersonForm = {
  email: "bob@x.com",
  givenName: "Bob",
  familyName: "Lindqvist",
  preferredName: null,
  title: null,
  phone: null,
  homeRegion: "US",
  homeTimezone: null,
  startDate: null,
  endDate: null,
  active: true,
  managerId: "p_max",
  assignedDeskId: "sp_1",
  teamIds: ["t_payroll", "t_hr"],
  primaryTeamId: "t_payroll",
  identities: {},
};

describe("applyBulkPatch", () => {
  it("changes only what the patch names", () => {
    expect(applyBulkPatch(bob, { active: false })).toEqual({ ...bob, active: false, swapDesk: false });
  });

  it("adds and removes teams, and drops a removed primary team", () => {
    const after = applyBulkPatch(bob, { addTeamIds: ["t_eng"], removeTeamIds: ["t_payroll"] });
    expect(after.teamIds).toEqual(["t_hr", "t_eng"]);
    expect(after.primaryTeamId).toBeNull();
  });

  it("joins a new primary team if need be", () => {
    const after = applyBulkPatch(bob, { primaryTeamId: "t_eng" });
    expect(after.teamIds).toEqual(["t_payroll", "t_hr", "t_eng"]);
    expect(after.primaryTeamId).toBe("t_eng");
  });

  it("sets or clears the manager", () => {
    expect(applyBulkPatch(bob, { managerId: "p_jane" }).managerId).toBe("p_jane");
    expect(applyBulkPatch(bob, { managerId: null }).managerId).toBeNull();
  });
});

describe("bulkPatchSchema", () => {
  it("needs at least one change", () => {
    expect(bulkPatchSchema.safeParse({}).success).toBe(false);
    expect(bulkPatchSchema.safeParse({ managerId: null }).success).toBe(true);
  });
});
