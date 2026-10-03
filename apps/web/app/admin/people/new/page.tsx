import { PersonFormEditor } from "@/components/admin/person-form";
import { getDb } from "@officeorg/db/client";
import { listPeopleForAdmin } from "@officeorg/db/queries/people";
import { listDeskOptions } from "@officeorg/db/queries/spaces";
import { listTeamsForAdmin } from "@officeorg/db/queries/teams";

export default async function NewPersonPage() {
  const db = getDb();
  const [people, desks, teams] = await Promise.all([listPeopleForAdmin(db), listDeskOptions(db), listTeamsForAdmin(db)]);

  return (
    <div>
      <h1 className="text-xl font-heading">New person</h1>
      <div className="mt-6">
        <PersonFormEditor
          initial={{
            email: "",
            name: "",
            preferredName: null,
            title: null,
            phone: null,
            homeCountry: "US",
            homeTimezone: null,
            startDate: null,
            active: true,
            managerId: null,
            assignedDeskId: null,
            teamIds: [],
            primaryTeamId: null,
          }}
          managers={people.map((p) => ({ id: p.id, name: p.name }))}
          desks={desks}
          teams={teams.map((t) => ({ id: t.id, name: t.name }))}
        />
      </div>
    </div>
  );
}
