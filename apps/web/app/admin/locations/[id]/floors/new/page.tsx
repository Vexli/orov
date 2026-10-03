import { notFound } from "next/navigation";
import { FloorFormEditor } from "@/components/admin/location-form";
import { getDb } from "@officeorg/db/client";
import { getLocation } from "@officeorg/db/queries/floors";

export default async function NewFloorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const location = await getLocation(getDb(), id);
  if (!location) notFound();

  return (
    <div>
      <h1 className="text-xl font-heading">New floor in {location.name}</h1>
      <p className="mt-1 text-sm text-muted-fg">
        Upload the drawing on the floor&apos;s page once it exists.
      </p>
      <div className="mt-6">
        <FloorFormEditor
          locationId={id}
          initial={{ slug: "", name: "", level: 0, sortOrder: 0 }}
          slugLocked={false}
        />
      </div>
    </div>
  );
}
