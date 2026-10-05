import Link from "next/link";
import { notFound } from "next/navigation";
import { FloorDrawingPanel } from "@/components/admin/floor-drawing";
import { FloorFormEditor } from "@/components/admin/location-form";
import { getDb } from "@orov/db/client";
import { getFloorForAdmin, listFloorSpacesForAdmin } from "@orov/db/queries/floors";
import { SpaceNames } from "@/components/admin/space-names";
import { ArchiveControls } from "@/components/admin/archive-controls";
import { formatDateTime, tierLabel } from "@orov/core";
import { requireAdmin } from "@/lib/session";

export default async function FloorAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  const { id } = await params;
  const floor = await getFloorForAdmin(getDb(), id);
  if (!floor) notFound();
  const names = await listFloorSpacesForAdmin(getDb(), id);
  // What this office calls its floors (#16).
  const tier = { singular: floor.location.floorLabelSingular, plural: floor.location.floorLabelPlural };

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/locations" className="text-sm text-muted-fg underline">
          Offices and floors
        </Link>
        <h1 className="mt-1 text-xl font-heading">
          {floor.location.name}, {floor.name}
        </h1>
      </div>

      <FloorDrawingPanel
        floorId={floor.id}
        tier={tier}
        currentAssetId={floor.svgAssetId}
        currentSvg={floor.currentSvg}
        versions={floor.versions.map((v) => ({
          id: v.id,
          version: v.version,
          uploadedBy: v.uploadedBy,
          uploadedLabel: formatDateTime(v.uploadedAt, user.dateFormat, user.timeZone, { zone: true }),
        }))}
      />

      <section aria-labelledby="names-heading">
        <h2 id="names-heading" className="font-heading">
          Room and area names
        </h2>
        <p className="mt-1 text-sm text-muted-fg">
          What the map, cards, lists and search call them. Renaming here needs no new drawing.
        </p>
        <SpaceNames floorId={floor.id} areas={names.areas} spaces={names.spaces} />
      </section>

      <section aria-labelledby="details-heading">
        <h2 id="details-heading" className="font-heading">
          {tierLabel(tier, "singular")} details
        </h2>
        <div className="mt-4">
          <FloorFormEditor
            locationId={floor.locationId}
            tier={tier}
            id={floor.id}
            initial={{
              slug: floor.slug,
              name: floor.name,
              level: floor.level,
              sortOrder: floor.sortOrder,
            }}
            slugLocked={floor.svgAssetId !== null}
          />
        </div>
      </section>

      <section aria-labelledby="archive-heading">
        <h2 id="archive-heading" className="font-heading">
          Archive or delete
        </h2>
        <div className="mt-3">
          <ArchiveControls
            kind="floor"
            id={floor.id}
            name={`${floor.location.name}, ${floor.name}`}
            archived={floor.archivedAt !== null}
            deletable={floor.versions.length === 0}
            afterDelete="/admin/locations"
          />
        </div>
      </section>
    </div>
  );
}
