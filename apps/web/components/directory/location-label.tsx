import Link from "next/link";
import type { DirectoryPerson } from "@orov/core/directory/model";
import { locationSummary } from "@orov/core/directory/filter";

const badgeClass = "rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-fg";

// "US-CA [SF-2-014]" or "IN-KA [Remote]", with the seat code or "Remote" drawn as a badge.
// With `linkDesk`, a seat code opens the map focused on the person, as the card's desk link does.
export function LocationLabel({ person, linkDesk = false }: { person: DirectoryPerson; linkDesk?: boolean }) {
  const { region, badge } = locationSummary(person);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <RegionText flag={person.homeRegionFlag} flagOnly={person.homeRegionFlagOnly} label={region} />{" "}
      {linkDesk && person.desk ? (
        <Link
          href={{ pathname: "/map", query: { person: person.id } }}
          aria-label={`Show ${person.desk.name} on the map`}
          className={`${badgeClass} underline underline-offset-2 hover:bg-accent`}
        >
          {badge}
        </Link>
      ) : (
        <span className={badgeClass}>{badge}</span>
      )}
    </span>
  );
}

// A region label with the viewer's flag choice (#28, N7). Screen readers would read "flag:
// Canada" before "Canada", so the flag is always hidden from them; with flags alone, the name is
// still in the page for them, and as a tooltip.
export function RegionText({ flag, flagOnly, label }: { flag: string | null; flagOnly: boolean; label: string }) {
  if (flag && flagOnly) {
    return (
      <span title={label}>
        <span aria-hidden="true">{flag}</span>
        <span className="sr-only">{label}</span>
      </span>
    );
  }
  return (
    <span>
      {flag ? <span aria-hidden="true">{flag} </span> : null}
      {label}
    </span>
  );
}
