import { PersonFormEditor } from "@/components/admin/person-form";
import { getDb } from "@orov/db/client";
import { listLocationsWithFloors } from "@orov/db/queries/floors";
import { listPeopleForAdmin } from "@orov/db/queries/people";
import { listDeskOptions, listPickerFloors } from "@orov/db/queries/spaces";
import { listTeamsForAdmin } from "@orov/db/queries/teams";

export default async function NewPersonPage() {
  const db = getDb();
  const [people, desks, floors, teams] = await Promise.all([
    listPeopleForAdmin(db),
    listDeskOptions(db),
    listPickerFloors(db),
    listTeamsForAdmin(db),
  ]);

  // Offices someone can belong to without a desk (N9).
  const offices = (await listLocationsWithFloors(getDb()))
    .filter((l) => l.archivedAt === null)
    .map((l) => ({ id: l.id, name: l.name }));

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
            managerIds: [],
            assignedDeskId: null,
            officeId: null,
            teamIds: [],
            primaryTeamId: null,
            identities: {},
          }}
          managers={people.map((p) => ({ id: p.id, name: p.name }))}
          desks={desks}
          floors={floors}
          teams={teams.map((t) => ({ id: t.id, name: t.name, parentTeamId: t.parentTeamId, leadId: t.leadId }))}
          offices={offices}
        />
      </div>
    </div>
  );
}
