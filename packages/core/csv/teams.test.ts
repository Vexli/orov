import { describe, expect, it } from "vitest";
import { parseTeamsCsv, teamsToCsv } from "./teams";

describe("parseTeamsCsv", () => {
  it("parses teams and normalizes the slug", () => {
    const { rows, issues } = parseTeamsCsv("slug,name,parent_slug,slack_channel_id,color\nHR,Human Resources,,C123,#ff0000\nhr-recruiting,Recruiting,HR,,\n");
    expect(issues).toEqual([]);
    expect(rows[0]?.record).toEqual({ slug: "hr", name: "Human Resources", parentSlug: null, slackChannelId: "C123", color: "#ff0000" });
    expect(rows[1]?.record.parentSlug).toBe("hr");
  });

  it("rejects slugs with spaces", () => {
    const { issues } = parseTeamsCsv("slug,name\nbad slug,Name\n");
    expect(issues[0]?.message).toMatch(/slug/);
  });

  it("round-trips through teamsToCsv", () => {
    const records = [{ slug: "hr", name: "HR", parentSlug: null, slackChannelId: "C1", color: null }];
    expect(parseTeamsCsv(teamsToCsv(records)).rows.map((r) => r.record)).toEqual(records);
  });
});
