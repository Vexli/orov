import Link from "next/link";
import type { DirectoryPerson } from "@officeorg/core/directory/model";
import { locationSummary } from "@officeorg/core/directory/filter";

const badgeClass = "rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-fg";

// "US-CA [SF-2-014]" or "IN-KA [Remote]", with the seat code or "Remote" drawn as a badge.
// With `linkDesk`, a seat code opens the map focused on the person, as the card's desk link does.
export function LocationLabel({ person, linkDesk = false }: { person: DirectoryPerson; linkDesk?: boolean }) {
  const { region, badge } = locationSummary(person);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span>
        {/* Screen readers would read "flag: Canada" before "Canada", so the flag is hidden from
            them; the text says the same. */}
        {person.homeRegionFlag ? <span aria-hidden="true">{person.homeRegionFlag} </span> : null}
        {region}
      </span>{" "}
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
