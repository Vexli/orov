import { eq, isNotNull } from "drizzle-orm";
import type { Executor } from "../client";
import * as s from "../schema";

export interface DeskOption {
  id: string;
  name: string;
  label: string;
  assignedPersonId: string | null;
  // False when someone else holds the seat, so the picker can show it as taken.
  available: boolean;
}

// Desks on active floors. A desk held by `currentPersonId` counts as available to them.
export async function listDeskOptions(db: Executor, currentPersonId?: string): Promise<DeskOption[]> {
  const desks = await db.query.space.findMany({
    where: eq(s.space.kind, "desk"),
    with: { floor: { with: { location: { columns: { name: true } } } } },
    orderBy: (sp, { asc }) => [asc(sp.name)],
  });
  const holders = await db
    .select({ personId: s.person.id, deskId: s.person.assignedDeskId })
    .from(s.person)
    .where(isNotNull(s.person.assignedDeskId));
  const holderByDesk = new Map(holders.map((h) => [h.deskId, h.personId]));

  return desks
    .filter((d) => d.archivedAt === null && d.floor.archivedAt === null)
    .map((d) => {
      const assignedPersonId = holderByDesk.get(d.id) ?? null;
      return {
        id: d.id,
        name: d.name,
        label: `${d.name} · ${d.floor.location.name}, ${d.floor.name}`,
        assignedPersonId,
        available: assignedPersonId === null || assignedPersonId === currentPersonId,
      };
    });
}
