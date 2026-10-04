"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { PersonForm } from "@officeorg/core";
import { PROFILE_PROVIDERS } from "@officeorg/core/people/identities";
import { inheritedManager, inheritedTeams } from "@officeorg/core/teams/tree";
import type { DeskOption, PickerFloor } from "@officeorg/db/queries/spaces";
import { savePersonAction, type SaveState } from "@/app/admin/people/actions";
import { SeatPicker } from "./seat-picker";
import { TimeZoneList } from "./time-zone-list";
import { sortByName } from "@officeorg/core/people/names";

export interface TeamChoice {
  id: string;
  name: string;
  parentTeamId: string | null;
  leadId: string | null;
}

interface Props {
  id?: string;
  initial: PersonForm;
  managers: { id: string; name: string }[];
  desks: DeskOption[];
  floors: PickerFloor[];
  teams: TeamChoice[];
}

const inputClass =
  "mt-1 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm";

export function PersonFormEditor({ id, initial, managers, desks, floors, teams }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<PersonForm>(initial);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  // The manager a blank manager gets on save (#11): the primary team's lead, or the lead above.
  const teamTree = new Map(teams.map((t) => [t.id, t]));
  const defaultManagerFor = (primaryTeamId: string | null) =>
    inheritedManager(id ?? "", primaryTeamId, teamTree);
  const defaultManagerId = defaultManagerFor(values.primaryTeamId);
  const defaultManager = managers.find((m) => m.id === defaultManagerId) ?? null;
  const leadOf = defaultManagerId ? teams.find((t) => t.leadId === defaultManagerId) : undefined;

  // Choosing another primary team moves the manager along, but only if they were the old team's
  // default; a manager the admin picked stays.
  function setPrimaryTeam(primaryTeamId: string | null) {
    setValues((v) => ({
      ...v,
      primaryTeamId,
      managerId: v.managerId !== null && v.managerId === defaultManagerFor(v.primaryTeamId) ? null : v.managerId,
    }));
  }

  // Teams the person is in because they're in one below (#23), and the ticked team it comes from.
  const inherited = new Set(inheritedTeams(values.teamIds, (teamId) => teamTree.get(teamId)?.parentTeamId));
  const viaTeam = (ancestorId: string) => {
    const below = values.teamIds.find((teamId) => {
      for (let p = teamTree.get(teamId)?.parentTeamId; p; p = teamTree.get(p)?.parentTeamId) {
        if (p === ancestorId) return true;
      }
      return false;
    });
    return teams.find((t) => t.id === below)?.name ?? null;
  };

  // The zone a blank home time zone gets on save (#19): the chosen desk's office's.
  const deskZone = desks.find((d) => d.id === values.assignedDeskId) ?? null;

  function set<K extends keyof PersonForm>(key: K, value: PersonForm[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function toggleTeam(teamId: string, on: boolean) {
    setValues((v) => {
      const teamIds = on ? [...v.teamIds, teamId] : v.teamIds.filter((t) => t !== teamId);
      const primaryTeamId = v.primaryTeamId && teamIds.includes(v.primaryTeamId) ? v.primaryTeamId : null;
      const managerId =
        primaryTeamId !== v.primaryTeamId && v.managerId === defaultManagerFor(v.primaryTeamId) ? null : v.managerId;
      return { ...v, teamIds, primaryTeamId, managerId };
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result: SaveState = await savePersonAction(values, id);
      if (result.ok) {
        router.push("/admin/people");
        router.refresh();
      } else {
        setError({ message: result.error, field: result.field });
      }
    });
  }

  const fieldError = (name: string) =>
    error?.field === name ? <p className="mt-1 text-xs text-destructive">{error.message}</p> : null;

  return (
    <form onSubmit={submit} className="grid gap-6 md:grid-cols-2" noValidate>
      {error && !error.field ? (
        <p role="alert" className="md:col-span-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error.message}
        </p>
      ) : null}

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm font-medium">
            Given name
            <input
              className={inputClass}
              autoComplete="off"
              value={values.givenName}
              onChange={(e) => set("givenName", e.target.value)}
            />
            {fieldError("givenName")}
          </label>
          <label className="block text-sm font-medium">
            Family name
            <input
              className={inputClass}
              autoComplete="off"
              value={values.familyName ?? ""}
              onChange={(e) => set("familyName", e.target.value || null)}
            />
          </label>
        </div>
        <label className="block text-sm font-medium">
          Email
          <input className={inputClass} type="email" value={values.email} onChange={(e) => set("email", e.target.value)} />
          {fieldError("email")}
        </label>
        <label className="block text-sm font-medium">
          Preferred name
          <input className={inputClass} value={values.preferredName ?? ""} onChange={(e) => set("preferredName", e.target.value || null)} />
        </label>
        <label className="block text-sm font-medium">
          Title
          <input className={inputClass} value={values.title ?? ""} onChange={(e) => set("title", e.target.value || null)} />
        </label>
        <label className="block text-sm font-medium">
          Phone
          <input className={inputClass} value={values.phone ?? ""} onChange={(e) => set("phone", e.target.value || null)} />
          {fieldError("phone")}
        </label>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm font-medium">
            Home region
            <input
              className={inputClass}
              maxLength={6}
              placeholder="US-CA"
              aria-describedby="home-region-hint"
              value={values.homeRegion}
              onChange={(e) => set("homeRegion", e.target.value.toUpperCase())}
            />
            <span id="home-region-hint" className="mt-1 block text-xs font-normal text-muted-fg">
              ISO 3166 country (US) or subdivision (US-CA)
            </span>
            {fieldError("homeRegion")}
          </label>
          {/* The hint sits outside the label, so it describes the input without becoming part
              of its name. */}
          <div>
            <label className="block text-sm font-medium">
              Home timezone
              <input
                className={inputClass}
                placeholder={deskZone ? `${deskZone.timezone} (from ${deskZone.locationName})` : "America/Toronto"}
                aria-describedby="home-timezone-hint"
                list="person-time-zones"
                value={values.homeTimezone ?? ""}
                onChange={(e) => set("homeTimezone", e.target.value || null)}
              />
            </label>
            <TimeZoneList id="person-time-zones" />
            <span id="home-timezone-hint" className="mt-1 block text-xs text-muted-fg">
              {deskZone
                ? `Left blank, it's set to ${deskZone.timezone} from the desk's office.`
                : "IANA time zone. Left blank, it's set from the desk's office."}
            </span>
            {fieldError("homeTimezone")}
          </div>
        </div>
        <label className="block text-sm font-medium">
          Start date
          <input className={inputClass} type="date" value={values.startDate ?? ""} onChange={(e) => set("startDate", e.target.value || null)} />
          {fieldError("startDate")}
        </label>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={values.active} onChange={(e) => set("active", e.target.checked)} />
          Active
        </label>

        <label className="block text-sm font-medium">
          Manager
          <select className={inputClass} value={values.managerId ?? ""} onChange={(e) => set("managerId", e.target.value || null)}>
            <option value="">
              {defaultManager
                ? `Default: ${defaultManager.name}${leadOf ? `, lead of ${leadOf.name}` : ""}`
                : "No manager"}
            </option>
            {sortByName(managers).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          {fieldError("managerId")}
        </label>

        <SeatPicker
          desks={desks}
          floors={floors}
          personId={id}
          value={values.assignedDeskId}
          swap={values.swapDesk === true}
          onChange={(deskId) => set("assignedDeskId", deskId)}
          onSwapChange={(swap) => set("swapDesk", swap)}
          error={fieldError("assignedDeskId")}
        />
      </div>

      <fieldset className="md:col-span-2">
        <legend className="text-sm font-medium">Other accounts</legend>
        <p className="mt-1 text-xs text-muted-fg">Shown as links on the person card. Leave blank for none.</p>
        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          {PROFILE_PROVIDERS.map((provider) => (
            <label key={provider.id} className="block text-sm font-medium">
              {provider.label}
              <input
                className={inputClass}
                aria-describedby={`identity-${provider.id}-hint`}
                value={values.identities[provider.id] ?? ""}
                onChange={(e) => set("identities", { ...values.identities, [provider.id]: e.target.value })}
              />
              <span id={`identity-${provider.id}-hint`} className="mt-1 block text-xs font-normal text-muted-fg">
                {provider.inputHint}
              </span>
              {fieldError(`identities.${provider.id}`)}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="md:col-span-2">
        <legend className="text-sm font-medium">Teams and primary team</legend>
        <p className="mt-1 text-xs text-muted-fg">
          Pick the primary team with the radio button. A person has at most one. A member of a sub-team is
          also a member of the teams above it.
        </p>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {teams.map((t) => {
            const checked = values.teamIds.includes(t.id);
            // A team above one that's ticked: membership follows automatically (#23).
            const through = !checked && inherited.has(t.id) ? viaTeam(t.id) : null;
            return (
              <li key={t.id} className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  aria-label={`Member of ${t.name}`}
                  aria-describedby={through ? `team-through-${t.id}` : undefined}
                  checked={checked || through !== null}
                  disabled={through !== null}
                  onChange={(e) => toggleTeam(t.id, e.target.checked)}
                />
                <span className="flex-1">
                  {t.name}
                  {through ? (
                    <span id={`team-through-${t.id}`} className="ml-2 text-xs text-muted-fg">
                      through {through}
                    </span>
                  ) : null}
                </span>
                <input
                  type="radio"
                  name="primaryTeam"
                  aria-label={`Primary team ${t.name}`}
                  disabled={!checked}
                  checked={values.primaryTeamId === t.id}
                  onChange={() => setPrimaryTeam(t.id)}
                />
              </li>
            );
          })}
        </ul>
        {fieldError("primaryTeamId")}
      </fieldset>

      <div className="flex items-center gap-3 md:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg disabled:opacity-50"
        >
          {pending ? "Saving…" : id ? "Save person" : "Create person"}
        </button>
        <Link href="/admin/people" className="text-sm underline">
          Cancel
        </Link>
      </div>
    </form>
  );
}
