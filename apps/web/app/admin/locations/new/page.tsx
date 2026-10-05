import { DEFAULT_TIER_LABELS } from "@orov/core";
import { LocationFormEditor } from "@/components/admin/location-form";

export default function NewLocationPage() {
  return (
    <div>
      <h1 className="text-xl font-heading">New office</h1>
      <div className="mt-6">
        <LocationFormEditor
          initial={{
            slug: "",
            name: "",
            timezone: "",
            region: "",
            sortOrder: 0,
            floorLabelSingular: DEFAULT_TIER_LABELS.singular,
            floorLabelPlural: DEFAULT_TIER_LABELS.plural,
          }}
          slugLocked={false}
        />
      </div>
    </div>
  );
}
