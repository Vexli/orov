import { describe, expect, it } from "vitest";
import { auditToCsv, changedFields, summarizeAuditChange } from "./audit";

const update = {
  at: new Date("2026-10-04T14:30:05.123Z"),
  actorEmail: "jane@example.com",
  entity: "person",
  entityId: "p_bob",
  action: "update",
  before: { name: "Bob", title: "Analyst", teamSlugs: ["hr"] },
  after: { name: "Bob", title: "Senior, Analyst", teamSlugs: ["hr", "payroll"] },
};

describe("changedFields", () => {
  it("lists fields whose values differ, including arrays", () => {
    expect(changedFields(update.before, update.after)).toEqual(["title", "teamSlugs"]);
  });

  it("treats a create or delete as every field changing", () => {
    expect(changedFields(null, { a: 1, b: null })).toEqual(["a"]);
    expect(changedFields({ a: 1 }, null)).toEqual(["a"]);
  });
});

describe("summarizeAuditChange", () => {
  it("shows one line per changed field", () => {
    expect(summarizeAuditChange(update.before, update.after)).toBe(
      'title: "Analyst" → "Senior, Analyst"\nteamSlugs: ["hr"] → ["hr","payroll"]',
    );
  });

  it("says so when nothing changed", () => {
    expect(summarizeAuditChange({ a: 1 }, { a: 1 })).toBe("(no field changes)");
  });
});

describe("auditToCsv", () => {
  it("writes ISO UTC times, the changed fields and the full JSON, quoted where needed", () => {
    const create = { ...update, action: "create", entityId: "p_new", before: null, after: { name: "New" } };
    expect(auditToCsv([update, create])).toMatchInlineSnapshot(`
      "at,actor_email,entity,entity_id,action,changed_fields,before,after
      2026-10-04T14:30:05.123Z,jane@example.com,person,p_bob,update,title;teamSlugs,"{""name"":""Bob"",""title"":""Analyst"",""teamSlugs"":[""hr""]}","{""name"":""Bob"",""title"":""Senior, Analyst"",""teamSlugs"":[""hr"",""payroll""]}"
      2026-10-04T14:30:05.123Z,jane@example.com,person,p_new,create,name,,"{""name"":""New""}"
      "
    `);
  });
});
