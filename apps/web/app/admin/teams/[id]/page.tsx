import { notFound } from "next/navigation";
import { TeamFormEditor } from "@/components/admin/team-form";
import { getDb } from "@orov/db/client";
import { listPeopleForAdmin } from "@orov/db/queries/people";
import { getTeamForEdit, listTeamsForAdmin } from "@orov/db/queries/teams";

export default async function EditTeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const initial = await getTeamForEdit(db, id);
  if (!initial) notFound();

  const [teams, people] = await Promise.all([listTeamsForAdmin(db), listPeopleForAdmin(db)]);

  // A team can't be its own parent, nor a sub-team of its own sub-team. Remove the whole subtree
  // from the parent picker. The server checks the same rule on save.
  const children = new Map<string, string[]>();
  for (const t of teams) {
    if (t.parentTeamId) children.set(t.parentTeamId, [...(children.get(t.parentTeamId) ?? []), t.id]);
  }
  const excluded = new Set<string>([id]);
  const queue = [id];
  while (queue.length) {
    for (const child of children.get(queue.shift()!) ?? []) {
      if (!excluded.has(child)) {
        excluded.add(child);
        queue.push(child);
      }
    }
  }

  return (
    <div>
      <h1 className="text-xl font-heading">{initial.name}</h1>
      <div className="mt-6">
        <TeamFormEditor
          id={id}
          initial={initial}
          parents={teams.filter((t) => !excluded.has(t.id)).map((t) => ({ id: t.id, name: t.name }))}
          leads={people.filter((p) => p.active || p.id === initial.leadId).map((p) => ({ id: p.id, name: p.name }))}
        />
      </div>
    </div>
  );
}
