import { notFound } from "next/navigation";
import { LocationFormEditor } from "@/components/admin/location-form";
import { getDb } from "@officeorg/db/client";
import { listLocationsWithFloors } from "@officeorg/db/queries/floors";

export default async function EditLocationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const location = (await listLocationsWithFloors(getDb())).find((l) => l.id === id);
  if (!location) notFound();

  return (
    <div>
      <h1 className="text-xl font-heading">{location.name}</h1>
      <div className="mt-6">
        <LocationFormEditor
          id={id}
          initial={{
            slug: location.slug,
            name: location.name,
            timezone: location.timezone,
            region: location.region,
            sortOrder: location.sortOrder,
          }}
          slugLocked={location.floors.length > 0}
        />
      </div>
    </div>
  );
}
