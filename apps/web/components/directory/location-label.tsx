import type { DirectoryPerson } from "@officeorg/core/directory/model";
import { locationSummary } from "@officeorg/core/directory/filter";

// "US-CA [SF-2-014]" or "IN-KA [Remote]", with the seat code or "Remote" drawn as a badge.
export function LocationLabel({ person }: { person: DirectoryPerson }) {
  const { region, badge } = locationSummary(person);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span>{region}</span>{" "}
      <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-fg">{badge}</span>
    </span>
  );
}
