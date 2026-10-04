import { describe, expect, it } from "vitest";
import { splitFullName } from "../people/names";
import type { DirectoryPerson, DirectoryTeam } from "../directory/model";
import { escapeHtml } from "./html";
import {
  initiallyVisible,
  managementChain,
  memberNodeId,
  nodesToReveal,
  ORG_ROOT_ID,
  personNodeId,
  reportingTree,
  teamHighlightIds,
  teamTree,
  type OrgNode,
} from "./tree";

const teams: DirectoryTeam[] = [
  { id: "t_hr", name: "HR", slug: "hr", parentTeamId: null },
  { id: "t_recruiting", name: "Recruiting", slug: "recruiting", parentTeamId: "t_hr" },
  { id: "t_payroll", name: "Payroll", slug: "payroll", parentTeamId: "t_hr" },
];

const team = (id: string, isPrimary = true) => {
  const t = teams.find((x) => x.id === id)!;
  return { id: t.id, name: t.name, slug: t.slug, isPrimary, inherited: false };
};

function person(
  overrides: Partial<DirectoryPerson> & { id: string; name: string },
): DirectoryPerson {
  return {
    ...splitFullName(overrides.name),
    identities: {},
    phone: null,
    preferredName: null,
    email: `${overrides.id}@example.com`,
    title: null,
    homeRegion: "US",
    homeRegionLabel: "United States",
    homeRegionFlag: null,
    homeRegionFlagOnly: false,
    homeTimezone: null,
    manager: null,
    desk: null,
    teams: [],
    ...overrides,
  };
}

const jane = person({ id: "p_jane", name: "Jane Park", title: "CEO", teams: [team("t_hr")] });
const max = person({
  id: "p_max",
  name: "Max Ito",
  manager: { id: "p_jane", name: "Jane Park" },
  teams: [team("t_hr")],
});
const bob = person({
  id: "p_bob",
  name: "Bob Lindqvist",
  manager: { id: "p_max", name: "Max Ito" },
  teams: [team("t_payroll"), team("t_hr", false)],
});
const priya = person({
  id: "p_priya",
  name: "Priya Shah",
  manager: { id: "p_max", name: "Max Ito" },
  teams: [team("t_recruiting")],
});
const people = [bob, jane, max, priya];

const parentOf = (nodes: OrgNode[], id: string) => nodes.find((n) => n.id === id)?.parentId;

describe("reportingTree", () => {
  it("links each person to their manager, with the single top person as the root", () => {
    const nodes = reportingTree(people);
    expect(nodes).toHaveLength(4);
    expect(parentOf(nodes, "p_jane")).toBeNull();
    expect(parentOf(nodes, "p_max")).toBe("p_jane");
    expect(parentOf(nodes, "p_bob")).toBe("p_max");
    expect(nodes.find((n) => n.id === "p_jane")).toMatchObject({
      kind: "person",
      personId: "p_jane",
      label: "Jane Park",
      detail: "CEO",
    });
  });

  it("puts several top people under a synthetic root", () => {
    const solo = person({ id: "p_solo", name: "Solo Contractor" });
    const nodes = reportingTree([...people, solo]);
    expect(nodes[0]).toMatchObject({ id: ORG_ROOT_ID, kind: "root", parentId: null });
    expect(parentOf(nodes, "p_jane")).toBe(ORG_ROOT_ID);
    expect(parentOf(nodes, "p_solo")).toBe(ORG_ROOT_ID);
    expect(nodes.filter((n) => n.parentId === null)).toHaveLength(1);
  });

  it("treats a manager missing from the list as no manager", () => {
    const nodes = reportingTree([bob, priya]);
    expect(parentOf(nodes, "p_bob")).toBe(ORG_ROOT_ID);
    expect(parentOf(nodes, "p_priya")).toBe(ORG_ROOT_ID);
  });

  it("cuts a manager cycle instead of producing a tree the chart can't draw", () => {
    const a = person({ id: "p_a", name: "A", manager: { id: "p_b", name: "B" } });
    const b = person({ id: "p_b", name: "B", manager: { id: "p_a", name: "A" } });
    const nodes = reportingTree([a, b]);
    expect(nodes.filter((n) => n.parentId === null)).toHaveLength(1);
    expect(nodes).toHaveLength(2);
  });

  it("uses the preferred name and orders siblings by name", () => {
    const zed = person({
      id: "p_z",
      name: "Aaron Zed",
      preferredName: "Zed",
      manager: { id: "p_max", name: "Max Ito" },
    });
    const nodes = reportingTree([...people, zed]);
    const underMax = nodes.filter((n) => n.parentId === "p_max").map((n) => n.label);
    expect(underMax).toEqual(["Bob Lindqvist", "Priya Shah", "Zed"]);
  });
});

describe("teamTree", () => {
  it("nests teams by parent and lists each team's members beneath it", () => {
    const nodes = teamTree(teams, people);
    expect(parentOf(nodes, "t_hr")).toBeNull();
    expect(parentOf(nodes, "t_payroll")).toBe("t_hr");
    expect(nodes.find((n) => n.id === "t_hr")?.detail).toBe("3 members");
    expect(nodes.find((n) => n.id === "t_payroll")?.detail).toBe("1 member");
    expect(parentOf(nodes, memberNodeId("t_payroll", "p_bob"))).toBe("t_payroll");
  });

  it("shows someone once for each team they belong to", () => {
    const nodes = teamTree(teams, people);
    const bobs = nodes.filter((n) => n.personId === "p_bob").map((n) => n.id);
    expect(bobs.sort()).toEqual([
      memberNodeId("t_hr", "p_bob"),
      memberNodeId("t_payroll", "p_bob"),
    ]);
  });

  it("puts several top-level teams under a synthetic root", () => {
    const eng: DirectoryTeam = {
      id: "t_eng",
      name: "Engineering",
      slug: "eng",
      parentTeamId: null,
    };
    const nodes = teamTree([...teams, eng], people);
    expect(nodes[0]).toMatchObject({ id: ORG_ROOT_ID, label: "All teams" });
    expect(parentOf(nodes, "t_eng")).toBe(ORG_ROOT_ID);
    expect(parentOf(nodes, "t_hr")).toBe(ORG_ROOT_ID);
  });

  it("is empty without teams", () => {
    expect(teamTree([], people)).toEqual([]);
  });
});

describe("teamTree with inherited memberships", () => {
  it("lists a person only under the teams they were put in", () => {
    const inHr = { id: "t_hr", name: "HR", slug: "hr", isPrimary: false, inherited: true };
    const priyaPlusHr = { ...priya, teams: [...priya.teams, inHr] };
    const ids = teamTree(teams, [jane, priyaPlusHr]).map((n) => n.id);
    expect(ids).toContain(memberNodeId("t_recruiting", "p_priya"));
    expect(ids).not.toContain(memberNodeId("t_hr", "p_priya"));
  });
});

describe("personNodeId", () => {
  it("is the person in the reporting tree", () => {
    expect(personNodeId("reporting", bob)).toBe("p_bob");
  });

  it("is their primary team's membership in the team tree, else their first team", () => {
    expect(personNodeId("team", bob)).toBe(memberNodeId("t_payroll", "p_bob"));
    const noPrimary = { id: "p_x", teams: [team("t_recruiting", false), team("t_hr", false)] };
    expect(personNodeId("team", noPrimary)).toBe(memberNodeId("t_recruiting", "p_x"));
    expect(personNodeId("team", { id: "p_y", teams: [] })).toBeNull();
  });
});

describe("teamHighlightIds", () => {
  it("lights up the members in the reporting tree, with sub-teams only when asked", () => {
    expect([...teamHighlightIds("reporting", "t_hr", false, teams, people)].sort()).toEqual([
      "p_bob",
      "p_jane",
      "p_max",
    ]);
    expect([...teamHighlightIds("reporting", "t_hr", true, teams, people)].sort()).toEqual([
      "p_bob",
      "p_jane",
      "p_max",
      "p_priya",
    ]);
  });

  it("lights up the team nodes and their members in the team tree", () => {
    expect([...teamHighlightIds("team", "t_hr", false, teams, people)].sort()).toEqual([
      "t_hr",
      "t_hr:p_bob",
      "t_hr:p_jane",
      "t_hr:p_max",
    ]);
    expect([...teamHighlightIds("team", "t_hr", true, teams, people)].sort()).toEqual([
      "t_hr",
      "t_hr:p_bob",
      "t_hr:p_jane",
      "t_hr:p_max",
      "t_payroll",
      "t_payroll:p_bob",
      "t_recruiting",
      "t_recruiting:p_priya",
    ]);
  });

  it("doesn't light a member's node under a team outside the scope", () => {
    // Payroll only: Bob's Payroll node lights up, his HR node doesn't.
    expect([...teamHighlightIds("team", "t_payroll", false, teams, people)].sort()).toEqual([
      "t_payroll",
      "t_payroll:p_bob",
    ]);
  });
});

describe("initiallyVisible", () => {
  it("shows the root and two levels below it", () => {
    const deep = person({ id: "p_deep", name: "Deep", manager: { id: "p_bob", name: "Bob" } });
    const visible = initiallyVisible(reportingTree([...people, deep]));
    expect([...visible].sort()).toEqual(["p_bob", "p_jane", "p_max", "p_priya"]);
  });
});

describe("nodesToReveal", () => {
  const nodes = teamTree(teams, people);

  it("opens the selected node's direct children", () => {
    const open = nodesToReveal(reportingTree(people), "p_max", new Set());
    expect([...open].sort()).toEqual(["p_bob", "p_max", "p_priya"]);
  });

  it("opens a highlighted team's members, but not a highlighted person's reports", () => {
    const open = nodesToReveal(nodes, null, new Set(["t_payroll"]));
    expect(open.has(memberNodeId("t_payroll", "p_bob"))).toBe(true);
    expect(open.has(memberNodeId("t_hr", "p_bob"))).toBe(false);

    const people2 = nodesToReveal(reportingTree(people), null, new Set(["p_max"]));
    expect([...people2]).toEqual(["p_max"]);
  });
});

describe("managementChain", () => {
  it("runs from the top down to the person", () => {
    expect(managementChain("p_bob", people).map((l) => l.name)).toEqual([
      "Jane Park",
      "Max Ito",
      "Bob Lindqvist",
    ]);
    expect(managementChain("p_jane", people).map((l) => l.id)).toEqual(["p_jane"]);
  });

  it("ends at a manager who isn't in the directory, marked as such", () => {
    expect(managementChain("p_bob", [bob])).toEqual([
      { id: "p_max", name: "Max Ito", inDirectory: false },
      { id: "p_bob", name: "Bob Lindqvist", inDirectory: true },
    ]);
  });

  it("stops at a cycle", () => {
    const a = person({ id: "p_a", name: "A", manager: { id: "p_b", name: "B" } });
    const b = person({ id: "p_b", name: "B", manager: { id: "p_a", name: "A" } });
    expect(managementChain("p_a", [a, b]).map((l) => l.id)).toEqual(["p_b", "p_a"]);
  });

  it("is empty for someone not in the directory", () => {
    expect(managementChain("p_nobody", people)).toEqual([]);
  });
});

describe("escapeHtml", () => {
  it("escapes markup in names", () => {
    expect(escapeHtml(`<img src=x onerror="alert('1')">&`)).toBe(
      "&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot;&gt;&amp;",
    );
  });
});
