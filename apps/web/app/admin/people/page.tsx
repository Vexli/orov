import Link from "next/link";
import { getDb } from "@officeorg/db/client";
import { listPeopleForAdmin } from "@officeorg/db/queries/people";
import { listTeamsForAdmin } from "@officeorg/db/queries/teams";
import { PeopleTable } from "@/components/admin/people-table";

export default async function PeopleAdminPage() {
  const db = getDb();
  const [people, teams] = await Promise.all([listPeopleForAdmin(db), listTeamsForAdmin(db)]);

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-heading">People</h1>
          <p className="mt-1 text-sm text-muted-fg">
            {people.length} people. Deactivate someone instead of deleting them, so their history
            stays intact.
          </p>
        </div>
        <Link
          href="/admin/people/new"
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-fg"
        >
          New person
        </Link>
      </div>

      <PeopleTable
        people={people}
        teams={teams.map((t) => ({ id: t.id, name: t.name, parentTeamId: t.parentTeamId }))}
      />
    </div>
  );
}
