import { TeamFormEditor } from "@/components/admin/team-form";
import { getDb } from "@officeorg/db/client";
import { listPeopleForAdmin } from "@officeorg/db/queries/people";
import { listTeamsForAdmin } from "@officeorg/db/queries/teams";

export default async function NewTeamPage() {
  const db = getDb();
  const [teams, people] = await Promise.all([listTeamsForAdmin(db), listPeopleForAdmin(db)]);

  return (
    <div>
      <h1 className="text-xl font-semibold">New team</h1>
      <div className="mt-6">
        <TeamFormEditor
          initial={{ slug: "", name: "", parentTeamId: null, leadId: null, slackChannelId: null, color: null }}
          parents={teams.map((t) => ({ id: t.id, name: t.name }))}
          leads={people.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name }))}
        />
      </div>
    </div>
  );
}
