import { describe, expect, it } from "vitest";
import type { TeamRecord } from "../records";
import { parseTeamsCsv } from "../csv/teams";
import { planTeamsImport } from "./teams";

const HEADER = "slug,name,parent_slug,slack_channel_id,color";

function team(slug: string, parentSlug: string | null = null): TeamRecord {
  return { slug, name: slug.toUpperCase(), parentSlug, slackChannelId: null, color: null };
}

function run(body: string, existing: TeamRecord[] = []) {
  const parsed = parseTeamsCsv(`${HEADER}\n${body}`);
  return planTeamsImport(parsed.rows, parsed.issues, new Map(existing.map((t) => [t.slug, t])));
}

describe("planTeamsImport", () => {
  it("creates new teams and resolves a parent defined later in the file", () => {
    const plan = run("sub,Sub,root,,\nroot,Root,,,\n");
    expect(plan.rows.map((r) => r.action)).toEqual(["create", "create"]);
    expect(plan.canApply).toBe(true);
  });

  it("rejects an unknown parent", () => {
    const plan = run("sub,Sub,ghost,,\n");
    expect(plan.rows[0]?.message).toMatch(/parent team "ghost"/);
  });

  it("rejects a parent cycle through existing teams", () => {
    // Existing: root -> child. The file sets root's parent to child, which closes a loop.
    const existing = [team("root"), team("child", "root")];
    const plan = run("root,ROOT,child,,\n", existing);
    expect(plan.rows[0]?.message).toMatch(/loops back to root/);
  });

  it("reports a field change for an update", () => {
    const plan = run("hr,People,,,\n", [team("hr")]);
    expect(plan.rows[0]?.action).toBe("update");
    expect(plan.rows[0]?.changes).toEqual([{ field: "name", before: "HR", after: "People" }]);
  });
});
