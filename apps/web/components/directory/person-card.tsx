import Link from "next/link";
import type { DirectoryPerson } from "@officeorg/core/directory/model";
import { displayName, initials } from "@officeorg/core/directory/filter";
import { LocationLabel } from "./location-label";

interface Props {
  person: DirectoryPerson;
  onSelectPerson: (id: string) => void;
  onClose?: () => void;
}

// Shared card for every view (plan.md §7). The desk links to the map, focused on this person.
// Presence and chat buttons arrive in Phases 4 and 5.
export function PersonCard({ person, onSelectPerson, onClose }: Props) {
  const name = displayName(person);
  return (
    <aside aria-label={`${name} details`} className="rounded-lg border border-border p-5">
      <div className="flex items-start gap-4">
        <div
          aria-hidden="true"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-fg"
        >
          {initials(name)}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-heading">{name}</h2>
          {person.title ? <p className="text-sm text-muted-fg">{person.title}</p> : null}
          <a
            href={`mailto:${person.email}`}
            className="break-all text-sm underline underline-offset-4"
          >
            {person.email}
          </a>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close card"
            className="text-lg leading-none text-muted-fg hover:text-fg"
          >
            ×
          </button>
        ) : null}
      </div>

      <dl className="mt-5 space-y-3 text-sm">
        <Field label="Location">
          <LocationLabel person={person} />
        </Field>
        <Field label="Desk">
          {person.desk ? (
            <Link
              href={{ pathname: "/map", query: { person: person.id } }}
              aria-label={`Show ${person.desk.name} on the map`}
              className="underline underline-offset-4"
            >
              {person.desk.name} · {person.desk.locationName}, {person.desk.floorName}
            </Link>
          ) : (
            "No desk assigned"
          )}
        </Field>
        <Field label="Manager">
          {person.manager ? (
            <button
              type="button"
              onClick={() => onSelectPerson(person.manager!.id)}
              className="underline underline-offset-4"
            >
              {person.manager.name}
            </button>
          ) : (
            "—"
          )}
        </Field>
        <Field label="Teams">
          {person.teams.length === 0 ? (
            "—"
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {person.teams.map((t) => (
                <li
                  key={t.id}
                  className={`rounded px-2 py-0.5 text-xs ${
                    t.isPrimary ? "bg-primary font-medium text-primary-fg" : "bg-muted text-fg"
                  }`}
                >
                  {t.name}
                  {t.isPrimary ? " (primary)" : ""}
                </li>
              ))}
            </ul>
          )}
        </Field>
        <Field label="Home timezone">{person.homeTimezone ?? "—"}</Field>
      </dl>
    </aside>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-fg">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
