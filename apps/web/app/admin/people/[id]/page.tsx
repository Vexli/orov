import { notFound } from "next/navigation";
import { fullName } from "@orov/core";
import { PersonFormEditor } from "@/components/admin/person-form";
import { getDb } from "@orov/db/client";
import { listLocationsWithFloors } from "@orov/db/queries/floors";
import { getPersonForEdit, listPeopleForAdmin } from "@orov/db/queries/people";
import { listDeskOptions, listPickerFloors } from "@orov/db/queries/spaces";
import { listTeamsForAdmin } from "@orov/db/queries/teams";

export default async function EditPersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const initial = await getPersonForEdit(db, id);
  if (!initial) notFound();

  const [people, desks, floors, teams] = await Promise.all([
    listPeopleForAdmin(db),
    listDeskOptions(db, id),
    listPickerFloors(db),
    listTeamsForAdmin(db),
  ]);

  // A manager can't be this person or anyone who reports to them, directly or not. Excluding
  // them here keeps the picker honest. saveTeam/savePerson check the same thing on the server.
  const reports = new Map<string, string[]>();
  for (const p of people) {
    for (const managerId of p.managerIds) reports.set(managerId, [...(reports.get(managerId) ?? []), p.id]);
  }
  const excluded = new Set<string>([id]);
  const queue = [id];
  while (queue.length) {
    for (const child of reports.get(queue.shift()!) ?? []) {
      if (!excluded.has(child)) {
        excluded.add(child);
        queue.push(child);
      }
    }
  }

  // Offices someone can belong to without a desk (N9).
  const offices = (await listLocationsWithFloors(getDb()))
    .filter((l) => l.archivedAt === null)
    .map((l) => ({ id: l.id, name: l.name }));

  return (
    <div>
      <h1 className="text-xl font-heading">{fullName(initial)}</h1>
      <div className="mt-6">
        <PersonFormEditor
          id={id}
          initial={initial}
          managers={people.filter((p) => !excluded.has(p.id)).map((p) => ({ id: p.id, name: p.name }))}
          desks={desks}
          floors={floors}
          teams={teams.map((t) => ({ id: t.id, name: t.name, parentTeamId: t.parentTeamId, leadId: t.leadId }))}
          offices={offices}
        />
      </div>
    </div>
  );
}
