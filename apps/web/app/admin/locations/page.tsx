import Link from "next/link";
import { getDb } from "@officeorg/db/client";
import { listLocationsWithFloors } from "@officeorg/db/queries/floors";
import { tierLabel } from "@officeorg/core";

// What an office calls its floors (#16).
const tierOf = (l: { floorLabelSingular: string; floorLabelPlural: string }) => ({
  singular: l.floorLabelSingular,
  plural: l.floorLabelPlural,
});

export default async function LocationsAdminPage() {
  const locations = await listLocationsWithFloors(getDb());

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-heading">Offices and floors</h1>
          <p className="mt-1 text-sm text-muted-fg">
            Each floor has one drawing. Open a floor to upload a new one or roll back.
          </p>
        </div>
        <Link
          href="/admin/locations/new"
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-fg"
        >
          New office
        </Link>
      </div>

      {locations.length === 0 ? (
        <p className="mt-6 text-sm text-muted-fg">No offices yet.</p>
      ) : null}

      <div className="mt-6 space-y-6">
        {locations.map((location) => (
          <section
            key={location.id}
            aria-label={location.name}
            className="rounded-lg border border-border p-5"
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="font-heading">{location.name}</h2>
              <span className="font-mono text-xs text-muted-fg">{location.slug}</span>
              <span className="text-xs text-muted-fg">
                {location.region} · {location.timezone}
              </span>
              <span className="ml-auto flex gap-4 text-sm">
                <Link href={`/admin/locations/${location.id}`} className="underline">
                  Edit office
                </Link>
                <Link href={`/admin/locations/${location.id}/floors/new`} className="underline">
                  Add {tierLabel(tierOf(location), "lower")}
                </Link>
              </span>
            </div>
            {location.floors.length === 0 ? (
              <p className="mt-3 text-sm text-muted-fg">No {tierLabel(tierOf(location), "lowerPlural")} yet.</p>
            ) : (
              <table className="mt-3 w-full text-left text-sm">
                <thead className="border-b border-border text-xs uppercase text-muted-fg">
                  <tr>
                    <th className="py-2 pr-3 font-medium">{tierLabel(tierOf(location), "singular")}</th>
                    <th className="py-2 pr-3 text-right font-medium">Level</th>
                    <th className="py-2 pr-3 text-right font-medium">Desks</th>
                    <th className="py-2 pr-3 font-medium">Drawing</th>
                    <th className="py-2 font-medium">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {location.floors.map((floor) => (
                    <tr key={floor.id} className="border-b border-border last:border-0">
                      <td className="py-2 pr-3">
                        <span className="font-medium">{floor.name}</span>{" "}
                        <span className="font-mono text-xs text-muted-fg">{floor.slug}</span>
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{floor.level}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{floor.deskCount}</td>
                      <td className="py-2 pr-3">{floor.svgAssetId ? "Uploaded" : "None yet"}</td>
                      <td className="py-2 text-right">
                        <Link href={`/admin/floors/${floor.id}`} className="underline">
                          Open {floor.name}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
