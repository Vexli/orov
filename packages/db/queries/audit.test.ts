import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestDatabase, type TestDatabase } from "../test-utils";
import * as s from "../schema";
import { listAudit, recordAudit } from "./audit";

let t: TestDatabase;

beforeAll(async () => {
  t = await startTestDatabase();
}, 180_000);

afterAll(async () => {
  await t?.close();
});

// Five entries over three days, from two admins.
beforeEach(async () => {
  await t.reset();
  const entries = [
    { at: "2026-10-01T09:00:00Z", actor: "jane@example.com", entity: "person", id: "p_1" },
    { at: "2026-10-01T23:59:59Z", actor: "jane@example.com", entity: "team", id: "t_1" },
    { at: "2026-10-02T00:00:00Z", actor: "max@example.com", entity: "person", id: "p_2" },
    { at: "2026-10-03T12:00:00Z", actor: "max@example.com", entity: "person", id: "p_3" },
    { at: "2026-10-03T13:00:00Z", actor: "ja_ne@example.com", entity: "floor", id: "fl_1" },
  ] as const;
  for (const e of entries) {
    await t.db.insert(s.auditLog).values({
      actorEmail: e.actor,
      entity: e.entity,
      entityId: e.id,
      action: "update",
      at: new Date(e.at),
    });
  }
});

const ids = (rows: { entityId: string }[]) => rows.map((r) => r.entityId);

describe("listAudit", () => {
  it("lists newest first", async () => {
    expect(ids(await listAudit(t.db))).toEqual(["fl_1", "p_3", "p_2", "t_1", "p_1"]);
  });

  it("filters by inclusive UTC dates", async () => {
    expect(ids(await listAudit(t.db, { from: "2026-10-02" }))).toEqual(["fl_1", "p_3", "p_2"]);
    expect(ids(await listAudit(t.db, { to: "2026-10-01" }))).toEqual(["t_1", "p_1"]);
    expect(ids(await listAudit(t.db, { from: "2026-10-02", to: "2026-10-02" }))).toEqual(["p_2"]);
  });

  it("filters by part of the actor's email, taking LIKE wildcards literally", async () => {
    expect(ids(await listAudit(t.db, { actor: "MAX" }))).toEqual(["p_3", "p_2"]);
    expect(ids(await listAudit(t.db, { actor: "ja_ne" }))).toEqual(["fl_1"]);
  });

  it("combines filters", async () => {
    expect(ids(await listAudit(t.db, { entity: "person", actor: "max", from: "2026-10-03" }))).toEqual([
      "p_3",
    ]);
  });

  it("pages backwards by id until it reaches the first entry", async () => {
    const seen: string[] = [];
    let beforeId: bigint | undefined;
    for (;;) {
      const page = await listAudit(t.db, { limit: 2, beforeId });
      seen.push(...ids(page));
      if (page.length < 2) break;
      beforeId = page[page.length - 1]!.id;
    }
    expect(seen).toEqual(["fl_1", "p_3", "p_2", "t_1", "p_1"]);
  });

  it("returns every match with no limit", async () => {
    for (let i = 0; i < 205; i++) {
      await recordAudit(t.db, "bulk@example.com", { entity: "person", entityId: `p_b${i}`, action: "create" });
    }
    expect(await listAudit(t.db, { actor: "bulk" })).toHaveLength(200);
    expect(await listAudit(t.db, { actor: "bulk", limit: null })).toHaveLength(205);
  });
});
