import Link from "next/link";
import { displayPhone, formatDate } from "@orov/core";
import { requireAdmin } from "@/lib/session";
import { getDb } from "@orov/db/client";
import { listPeopleForAdmin } from "@orov/db/queries/people";
import { listTeamsForAdmin } from "@orov/db/queries/teams";
import { PeopleTable } from "@/components/admin/people-table";

export default async function PeopleAdminPage() {
  const user = await requireAdmin();
  const db = getDb();
  const [people, teams] = await Promise.all([listPeopleForAdmin(db), listTeamsForAdmin(db)]);
  // Numbers stored before phones were validated, and that don't parse on their own. Saving the
  // person (or re-importing them) normalizes or rejects each one.
  const badPhones = people.filter((p) => p.phone && displayPhone(p.phone).uri === null);

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

      {badPhones.length > 0 ? (
        <section
          aria-label="Phone numbers to fix"
          className="mt-6 rounded-md border border-border bg-muted p-4 text-sm"
        >
          <p>
            {badPhones.length === 1 ? "1 phone number isn't" : `${badPhones.length} phone numbers aren't`} in a
            standard format. Open the person and save to fix it, or correct it in the spreadsheet.
          </p>
          <ul className="mt-2 space-y-1">
            {badPhones.map((p) => (
              <li key={p.id}>
                <Link href={`/admin/people/${p.id}`} className="underline underline-offset-4">
                  {p.name}
                </Link>{" "}
                <span className="font-mono text-xs text-muted-fg">{p.phone}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <PeopleTable
        people={people.map((p) => ({
          ...p,
          // A calendar date, so it's formatted in UTC: no zone can move it to another day.
          endDateLabel: p.endDate ? formatDate(new Date(`${p.endDate}T00:00:00Z`), user.dateFormat) : null,
        }))}
        teams={teams.map((t) => ({ id: t.id, name: t.name, parentTeamId: t.parentTeamId }))}
      />
    </div>
  );
}
