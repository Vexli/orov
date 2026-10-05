import { notFound } from "next/navigation";
import { ArchiveControls } from "@/components/admin/archive-controls";
import { LocationFormEditor } from "@/components/admin/location-form";
import { LocationThemeEditor } from "@/components/admin/location-theme-editor";
import { getCurrentTheme } from "@/lib/theme";
import { getDb } from "@orov/db/client";
import { listLocationsWithFloors } from "@orov/db/queries/floors";

export default async function EditLocationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [locations, theme] = await Promise.all([listLocationsWithFloors(getDb()), getCurrentTheme()]);
  const location = locations.find((l) => l.id === id);
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
      <section aria-labelledby="map-colors-heading" className="mt-10 max-w-3xl">
        <h2 id="map-colors-heading" className="font-heading">
          Map colors
        </h2>
        <p className="mt-1 text-sm text-muted-fg">
          Colors this office&apos;s floors use on the map, in place of the organization&apos;s theme. The rest
          of the app keeps the theme.
        </p>
        <div className="mt-3">
          <LocationThemeEditor id={location.id} initial={location.mapTheme ?? null} theme={theme.values} />
        </div>
      </section>
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
