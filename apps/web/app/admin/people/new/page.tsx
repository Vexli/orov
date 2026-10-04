import { PersonFormEditor } from "@/components/admin/person-form";
import { getDb } from "@officeorg/db/client";
import { listPeopleForAdmin } from "@officeorg/db/queries/people";
import { listDeskOptions, listPickerFloors } from "@officeorg/db/queries/spaces";
import { listTeamsForAdmin } from "@officeorg/db/queries/teams";

export default async function NewPersonPage() {
  const db = getDb();
  const [people, desks, floors, teams] = await Promise.all([
    listPeopleForAdmin(db),
    listDeskOptions(db),
    listPickerFloors(db),
    listTeamsForAdmin(db),
  ]);

  return (
    <div>
      <h1 className="text-xl font-heading">New person</h1>
      <div className="mt-6">
        <PersonFormEditor
          initial={{
            email: "",
            givenName: "",
            familyName: null,
            preferredName: null,
            title: null,
            phone: null,
            homeRegion: "US",
            homeTimezone: null,
            startDate: null,
            endDate: null,
            active: true,
            managerId: null,
            assignedDeskId: null,
            teamIds: [],
            primaryTeamId: null,
            identities: {},
          }}
          managers={people.map((p) => ({ id: p.id, name: p.name }))}
          desks={desks}
          floors={floors}
          teams={teams.map((t) => ({ id: t.id, name: t.name, parentTeamId: t.parentTeamId, leadId: t.leadId }))}
        />
      </div>
    </div>
  );
}
