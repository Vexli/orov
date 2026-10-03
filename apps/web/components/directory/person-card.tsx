import type { DirectoryPerson } from "@officeorg/core/directory/model";
import { basedInLabel, displayName } from "@officeorg/core/directory/filter";

interface Props {
  person: DirectoryPerson;
  onSelectPerson: (id: string) => void;
  onClose?: () => void;
}

// Shared card for every view (plan.md §7). Presence and chat buttons arrive in Phases 4 and 5.
export function PersonCard({ person, onSelectPerson, onClose }: Props) {
  const name = displayName(person);
  return (
    <aside aria-label={`${name} details`} className="rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
      <div className="flex items-start gap-4">
        <div
          aria-hidden="true"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-sm font-semibold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
        >
          {initials(name)}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">{name}</h2>
          {person.title ? <p className="text-sm text-neutral-600 dark:text-neutral-400">{person.title}</p> : null}
          <a href={`mailto:${person.email}`} className="break-all text-sm underline underline-offset-4">
            {person.email}
          </a>
        </div>
        {onClose ? (
          <button type="button" onClick={onClose} aria-label="Close card" className="text-lg leading-none text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
            ×
          </button>
        ) : null}
      </div>

      <dl className="mt-5 space-y-3 text-sm">
        <Field label="Location">{basedInLabel(person)}</Field>
        <Field label="Desk">
          {person.desk ? `${person.desk.name} · ${person.desk.locationName}, ${person.desk.floorName}` : "No desk assigned"}
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
                    t.isPrimary
                      ? "bg-neutral-900 font-medium text-white dark:bg-white dark:text-neutral-900"
                      : "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
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
      <dt className="text-xs uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}
