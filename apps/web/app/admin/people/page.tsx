import Link from "next/link";
import { getDb } from "@officeorg/db/client";
import { listPeopleForAdmin } from "@officeorg/db/queries/people";

export default async function PeopleAdminPage() {
  const people = await listPeopleForAdmin(getDb());

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-heading">People</h1>
          <p className="mt-1 text-sm text-muted-fg">
            {people.length} people. Deactivate someone instead of deleting them, so their history stays intact.
          </p>
        </div>
        <Link href="/admin/people/new" className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-fg">
          New person
        </Link>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted-fg">
            <tr>
              <th className="py-2 pr-3 font-medium">Name</th>
              <th className="py-2 pr-3 font-medium">Title</th>
              <th className="py-2 pr-3 font-medium">Teams</th>
              <th className="py-2 pr-3 font-medium">Manager</th>
              <th className="py-2 pr-3 font-medium">Desk</th>
              <th className="py-2 pr-3 font-medium">Status</th>
              <th className="py-2 font-medium"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id} className="border-b border-border">
                <td className="py-2 pr-3">
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-muted-fg">{p.email}</div>
                </td>
                <td className="py-2 pr-3 text-muted-fg">{p.title ?? "—"}</td>
                <td className="py-2 pr-3">
                  {p.teams.length === 0 ? "—" : p.teams.map((t) => (
                    <span key={t.id} className={`mr-1 inline-block rounded px-1.5 py-0.5 text-xs ${t.isPrimary ? "bg-primary text-primary-fg" : "bg-muted"}`}>
                      {t.name}
                    </span>
                  ))}
                </td>
                <td className="py-2 pr-3">{p.managerName ?? "—"}</td>
                <td className="py-2 pr-3 font-mono text-xs">{p.deskName ?? "—"}</td>
                <td className="py-2 pr-3">{p.active ? "Active" : <span className="text-muted-fg">Inactive</span>}</td>
                <td className="py-2 text-right">
                  <Link href={`/admin/people/${p.id}`} className="underline">
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
