import { and, eq, inArray, isNull } from "drizzle-orm";
import { planSeating, type PlanDesk, type PlanPerson } from "@orov/core";
import { deskCenters } from "@orov/core/svg/positions";
import type { Database, Executor } from "../client";
import * as s from "../schema";
import { recordAudit } from "./audit";
import { ValidationError } from "./errors";
import { loadPersonRecord } from "./people";

// The seating planner (N10): rearranges the people already seated in one office so each team sits
// together. The plan is a preview; applying writes exactly the assignment that was reviewed.

export interface SeatingDesk extends PlanDesk {
  code: string;
  floorName: string;
}

export interface SeatingPerson extends PlanPerson {
  teamName: string | null;
}

export interface SeatingInput {
  desks: SeatingDesk[];
  people: SeatingPerson[];
}

// The office's assignable desks with their positions, and the active people sitting at them.
export async function loadSeatingInput(db: Executor, locationId: string): Promise<SeatingInput> {
  const floors = await db.query.floor.findMany({
    where: and(eq(s.floor.locationId, locationId), isNull(s.floor.archivedAt)),
    orderBy: (f, { asc }) => [asc(f.sortOrder), asc(f.level)],
  });
  const desks: SeatingDesk[] = [];
  for (const [floorIndex, floor] of floors.entries()) {
    if (!floor.svgAssetId) continue;
    const asset = await db.query.svgAsset.findFirst({ where: eq(s.svgAsset.id, floor.svgAssetId) });
    const centers = deskCenters(asset?.sanitizedSvg ?? "");
    const rows = await db.query.space.findMany({
      where: and(
        eq(s.space.floorId, floor.id),
        eq(s.space.kind, "desk"),
        isNull(s.space.archivedAt),
      ),
    });
    for (const desk of rows) {
      const c = centers.get(desk.svgElementId);
      if (!c) continue;
      desks.push({
        id: desk.id,
        code: desk.name,
        floorName: floor.name,
        floorIndex,
        areaId: desk.areaId,
        x: c.x,
        y: c.y,
      });
    }
  }

  const deskIds = desks.map((d) => d.id);
  const people = deskIds.length
    ? await db.query.person.findMany({
        where: and(eq(s.person.active, true), inArray(s.person.assignedDeskId, deskIds)),
        with: { teamMembers: { with: { team: { columns: { id: true, name: true } } } } },
      })
    : [];
  return {
    desks,
    people: people.map((p) => {
      const primary = p.teamMembers.find((m) => m.isPrimary)?.team ?? null;
      return {
        id: p.id,
        name: p.name,
        teamId: primary?.id ?? null,
        teamName: primary?.name ?? null,
        currentDeskId: p.assignedDeskId,
        locked: false,
      };
    }),
  };
}

export interface SeatingMove {
  personId: string;
  name: string;
  teamName: string | null;
  fromDeskId: string | null;
  fromCode: string | null;
  toDeskId: string;
  toCode: string;
  toFloor: string;
}

export async function previewSeating(
  db: Executor,
  locationId: string,
  lockedIds: readonly string[],
) {
  const input = await loadSeatingInput(db, locationId);
  const locked = new Set(lockedIds);
  const people = input.people.map((p) => ({ ...p, locked: locked.has(p.id) }));
  const { assignments, unseated } = planSeating(input.desks, people);
  const deskById = new Map(input.desks.map((d) => [d.id, d]));
  const moves: SeatingMove[] = [];
  for (const p of people) {
    const to = assignments.get(p.id);
    if (!to || to === p.currentDeskId) continue;
    const from = p.currentDeskId ? deskById.get(p.currentDeskId) : undefined;
    const desk = deskById.get(to)!;
    moves.push({
      personId: p.id,
      name: p.name,
      teamName: p.teamName,
      fromDeskId: p.currentDeskId,
      fromCode: from?.code ?? null,
      toDeskId: to,
      toCode: desk.code,
      toFloor: desk.floorName,
    });
  }
  moves.sort(
    (a, b) => (a.teamName ?? "").localeCompare(b.teamName ?? "") || a.name.localeCompare(b.name),
  );
  return { moves, unseated, people: people.length, desks: input.desks.length };
}

// Writes a reviewed plan: each person to their desk. Every desk must be one of the office's, and
// only desks held by people in the plan, or free ones, can be taken, so nobody outside the plan is
// moved. Desks are cleared first and then set, so people can trade desks without tripping the
// one-person-per-desk index.
export async function applySeating(
  db: Database,
  actorEmail: string,
  locationId: string,
  moves: readonly { personId: string; deskId: string }[],
): Promise<{ moved: number }> {
  return db.transaction(async (tx) => {
    const input = await loadSeatingInput(tx, locationId);
    const officeDesks = new Set(input.desks.map((d) => d.id));
    const seated = new Map(input.people.map((p) => [p.id, p]));
    const people = new Set<string>();
    const desks = new Set<string>();
    for (const move of moves) {
      if (!seated.has(move.personId))
        throw new ValidationError("Someone in the plan no longer sits in this office. Plan again.");
      if (!officeDesks.has(move.deskId))
        throw new ValidationError("A desk in the plan is no longer available. Plan again.");
      if (people.has(move.personId) || desks.has(move.deskId))
        throw new ValidationError("The plan gives someone two desks, or a desk to two people.");
      people.add(move.personId);
      desks.add(move.deskId);
    }
    const holders = await tx
      .select({ id: s.person.id, deskId: s.person.assignedDeskId })
      .from(s.person)
      .where(inArray(s.person.assignedDeskId, [...desks]));
    for (const holder of holders) {
      if (!people.has(holder.id))
        throw new ValidationError("A desk in the plan has been given to someone else. Plan again.");
    }

    const changed = moves.filter((m) => seated.get(m.personId)!.currentDeskId !== m.deskId);
    const before = new Map<string, Awaited<ReturnType<typeof loadPersonRecord>>>();
    for (const m of changed) before.set(m.personId, await loadPersonRecord(tx, m.personId));
    if (changed.length > 0) {
      await tx
        .update(s.person)
        .set({ assignedDeskId: null })
        .where(
          inArray(
            s.person.id,
            changed.map((m) => m.personId),
          ),
        );
    }
    for (const m of changed) {
      await tx
        .update(s.person)
        .set({ assignedDeskId: m.deskId, updatedAt: new Date() })
        .where(eq(s.person.id, m.personId));
      const after = await loadPersonRecord(tx, m.personId);
      await recordAudit(tx, actorEmail, {
        entity: "person",
        entityId: m.personId,
        action: "update",
        before: before.get(m.personId),
        after,
      });
    }
    return { moved: changed.length };
  });
}
