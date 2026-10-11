import { describe, expect, it } from "vitest";
import { parseTeamsCsv, teamsToCsv } from "./teams";

describe("parseTeamsCsv", () => {
  it("parses teams and normalizes the slug", () => {
    const { rows, issues } = parseTeamsCsv(
      "slug,name,parent_slug,chat_channel_id,color\nHR,Human Resources,,C123,#ff0000\nhr-recruiting,Recruiting,HR,,\n",
    );
    expect(issues).toEqual([]);
    expect(rows[0]?.record).toEqual({
      slug: "hr",
      name: "Human Resources",
      parentSlug: null,
      chatChannelId: "C123",
      color: "#ff0000",
    });
    expect(rows[1]?.record.parentSlug).toBe("hr");
  });

  it("still reads the old slack_channel_id column", () => {
    const { rows } = parseTeamsCsv("slug,name,slack_channel_id\nhr,HR,C123\n");
    expect(rows[0]?.record.chatChannelId).toBe("C123");
  });

  it("rejects slugs with spaces", () => {
    const { issues } = parseTeamsCsv("slug,name\nbad slug,Name\n");
    expect(issues[0]?.message).toMatch(/slug/);
  });

  it("round-trips through teamsToCsv", () => {
    const records = [
      { slug: "hr", name: "HR", parentSlug: null, chatChannelId: "C1", color: null },
    ];
    expect(parseTeamsCsv(teamsToCsv(records)).rows.map((r) => r.record)).toEqual(records);
  });

  it("writes a formula-like name as text, and reads it back unchanged", () => {
    const records = [
      { slug: "ops", name: "=1+1", parentSlug: null, chatChannelId: null, color: null },
    ];
    const csv = teamsToCsv(records);
    expect(csv).toContain("'=1+1");
    expect(parseTeamsCsv(csv).rows.map((r) => r.record)).toEqual(records);
  });
});
