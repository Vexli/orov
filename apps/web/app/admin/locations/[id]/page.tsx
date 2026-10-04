import { notFound } from "next/navigation";
import { ArchiveControls } from "@/components/admin/archive-controls";
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
            floorLabelSingular: location.floorLabelSingular,
            floorLabelPlural: location.floorLabelPlural,
          }}
          slugLocked={location.floors.length > 0}
        />
      </div>
      <section aria-labelledby="archive-heading" className="mt-10">
        <h2 id="archive-heading" className="font-heading">
          Archive or delete
        </h2>
        <div className="mt-3">
          <ArchiveControls
            kind="office"
            id={location.id}
            name={location.name}
            archived={location.archivedAt !== null}
            deletable={location.floors.every((f) => f.svgAssetId === null)}
            afterDelete="/admin/locations"
          />
        </div>
      </section>
    </div>
  );
}
