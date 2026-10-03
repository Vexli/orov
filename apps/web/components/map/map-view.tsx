"use client";

import { useCallback, useEffect, useMemo, useTransition } from "react";
import { useQueryStates } from "nuqs";
import type {
  DirectoryPerson,
  DirectoryTeam,
  MapData,
  MapLocation,
  MapSeat,
  MapSpace,
} from "@officeorg/core";
import { mapStateCss } from "@officeorg/core/map/state-css";
import { teamSeats, type TeamSeats } from "@officeorg/core/map/team-seats";
import { displayName, initials } from "@officeorg/core/directory/filter";
import { PersonCard } from "@/components/directory/person-card";
import { mapParsers } from "@/lib/url-state";
import { FloorMap, type Avatar } from "./floor-map";

interface Props {
  map: MapData;
  people: DirectoryPerson[];
  teams: DirectoryTeam[];
}

const KIND_LABEL: Record<MapSpace["kind"], string> = {
  desk: "Desk",
  meeting_room: "Meeting room",
  phone_booth: "Phone booth",
  kitchen: "Kitchen",
  elevator: "Elevator",
  restroom: "Restroom",
  other: "Point of interest",
};

export function MapView({ map, people, teams }: Props) {
  // Selection is client-only state in the URL. Changing floors needs the server's drawing, so
  // those updates opt out of shallow routing where they're made.
  const [params, setParams] = useQueryStates(mapParsers, { history: "replace" });
  const [navigating, startTransition] = useTransition();
  const floor = map.floor;

  // A new floor comes from the server. The area and room picked on the old floor don't apply.
  // Choosing a floor by hand ends a person focus, which would otherwise pull the map straight
  // back to their desk. Following a person keeps it.
  const goTo = useCallback(
    (loc: string, floorSlug: string | null, follow = false) => {
      void setParams(
        { loc, floor: floorSlug, area: null, space: null, ...(follow ? {} : { person: null }) },
        { shallow: false, startTransition },
      );
    },
    [setParams],
  );

  // Person focus (U1): the map follows the focused person's desk to its floor, and to its area
  // when an area is open. Only to floors with a drawing, or it would keep reloading a fallback.
  const personSeat = params.person
    ? (map.seats.find((s) => s.personId === params.person) ?? null)
    : null;
  const seatFloorHasDrawing =
    !!personSeat &&
    !!map.locations
      .find((l) => l.slug === personSeat.locationSlug)
      ?.floors.find((f) => f.slug === personSeat.floorSlug)?.hasDrawing;
  useEffect(() => {
    if (!floor || !personSeat || !seatFloorHasDrawing) return;
    if (personSeat.locationSlug !== floor.locationSlug || personSeat.floorSlug !== floor.slug) {
      goTo(personSeat.locationSlug, personSeat.floorSlug, true);
      return;
    }
    // Already on the right floor (the server picked it): make the URL say so, so a shared link
    // keeps working, and move an open area to the person's.
    const sync: { loc?: string; floor?: string; area?: string | null } = {};
    if (params.loc !== floor.locationSlug || params.floor !== floor.slug) {
      sync.loc = floor.locationSlug;
      sync.floor = floor.slug;
    }
    if (params.area && params.area !== personSeat.areaSlug) sync.area = personSeat.areaSlug;
    if (Object.keys(sync).length > 0) void setParams(sync);
  }, [
    floor,
    personSeat,
    seatFloorHasDrawing,
    params.loc,
    params.floor,
    params.area,
    goTo,
    setParams,
  ]);

  // Team highlight (U2), with or without sub-teams, the same scope as the directory's filter.
  const team = useMemo<TeamSeats | null>(
    () =>
      params.team
        ? teamSeats(params.team, params.sub, {
            teams,
            people,
            seats: map.seats,
            locations: map.locations,
          })
        : null,
    [params.team, params.sub, teams, people, map.seats, map.locations],
  );
  const teamPeople = useMemo(() => new Set(team?.seats.map((s) => s.personId)), [team]);

  const focusArea = floor?.areas.find((a) => a.slug === params.area) ?? null;

  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const seatsHere = useMemo(
    () =>
      floor
        ? map.seats.filter(
            (s) => s.locationSlug === floor.locationSlug && s.floorSlug === floor.slug,
          )
        : [],
    [map.seats, floor],
  );

  const selectedPerson = params.person ? (peopleById.get(params.person) ?? null) : null;
  const selectedSpace =
    floor && params.space ? (floor.spaces.find((s) => s.id === params.space) ?? null) : null;
  const personSeatHere = seatsHere.find((s) => s.personId === params.person) ?? null;

  const stateCss = useMemo(
    () =>
      mapStateCss({
        highlighted: seatsHere.filter((s) => teamPeople.has(s.personId)).map((s) => s.svgElementId),
        selected: [personSeatHere?.svgElementId, selectedSpace?.svgElementId].filter(
          (id): id is string => !!id,
        ),
      }),
    [personSeatHere, selectedSpace, seatsHere, teamPeople],
  );

  const avatars = useMemo<Avatar[]>(
    () =>
      seatsHere.flatMap((seat) => {
        const person = peopleById.get(seat.personId);
        if (!person) return [];
        const name = displayName(person);
        return [
          {
            svgElementId: seat.svgElementId,
            initials: initials(name),
            name,
            emphasis:
              seat.personId === params.person
                ? ("selected" as const)
                : teamPeople.has(seat.personId)
                  ? ("highlighted" as const)
                  : null,
            dimmed: focusArea !== null && seat.areaSlug !== focusArea.slug,
          },
        ];
      }),
    [seatsHere, peopleById, params.person, focusArea, teamPeople],
  );

  function select(svgElementId: string) {
    const seat = seatsHere.find((s) => s.svgElementId === svgElementId);
    if (seat) {
      setParams({ person: seat.personId, space: null });
      return;
    }
    const space = floor?.spaces.find((s) => s.svgElementId === svgElementId);
    if (space) setParams({ space: space.id, person: null });
  }

  if (!floor) {
    return (
      <div>
        <h1 className="text-xl font-heading">Map</h1>
        <p className="mt-4 rounded-lg border border-dashed border-border p-5 text-sm text-muted-fg">
          No floor has a drawing yet. An admin can upload one under Admin → Offices &amp; floors.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section aria-label="Floor map" className="min-w-0" aria-busy={navigating}>
        <h1 className="text-xl font-heading">
          {floor.locationName}, {floor.name}
          {focusArea ? `, ${focusArea.name}` : ""}
        </h1>
        <MapNavigation
          locations={map.locations}
          locationSlug={floor.locationSlug}
          floorSlug={floor.slug}
          areas={floor.areas}
          areaSlug={focusArea?.slug ?? null}
          onFloor={goTo}
          onArea={(area) => setParams({ area, space: null })}
        />
        <TeamHighlight
          teams={teams}
          teamId={params.team}
          includeSubteams={params.sub}
          result={team}
          currentFloor={{ loc: floor.locationSlug, floor: floor.slug }}
          onChange={(teamId, sub) => setParams({ team: teamId, sub: teamId ? sub : null })}
          onFloor={goTo}
        />
        <div className={`mt-4 transition-opacity ${navigating ? "opacity-60" : ""}`}>
          <FloorMap
            assetId={floor.assetId}
            svg={floor.svg}
            stateCss={stateCss}
            avatars={avatars}
            label={`Floor plan of ${floor.locationName}, ${floor.name}`}
            onSelect={select}
            focusAreaId={focusArea?.svgElementId ?? null}
          />
        </div>
      </section>

      <div className="lg:sticky lg:top-6 lg:self-start">
        {selectedPerson && !personSeat ? (
          <p role="note" className="mb-3 rounded-md bg-muted p-3 text-sm">
            {displayName(selectedPerson)} has no desk, so they aren&apos;t on the map.
          </p>
        ) : null}
        {selectedPerson && personSeat && !seatFloorHasDrawing ? (
          <p role="note" className="mb-3 rounded-md bg-muted p-3 text-sm">
            {personSeat.deskName} is on {personSeat.locationName}, {personSeat.floorName}, which has
            no drawing yet.
          </p>
        ) : null}
        {selectedPerson ? (
          <PersonCard
            person={selectedPerson}
            onSelectPerson={(id) => setParams({ person: id, space: null })}
            onClose={() => setParams({ person: null })}
          />
        ) : selectedSpace ? (
          <SpaceCard
            space={selectedSpace}
            areaName={floor.areas.find((a) => a.id === selectedSpace.areaId)?.name ?? null}
            onClose={() => setParams({ space: null })}
          />
        ) : (
          <OfficeOverview
            location={map.locations.find((l) => l.slug === floor.locationSlug)!}
            currentFloor={floor.slug}
            seats={map.seats}
            onFloor={goTo}
          />
        )}
      </div>
    </div>
  );
}

function SpaceCard({
  space,
  areaName,
  onClose,
}: {
  space: MapSpace;
  areaName: string | null;
  onClose: () => void;
}) {
  return (
    <aside aria-label={`${space.name} details`} className="rounded-lg border border-border p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-heading">{space.name}</h2>
          <p className="text-sm text-muted-fg">
            {space.kind === "desk" ? "Free desk" : KIND_LABEL[space.kind]}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close card"
          className="text-lg leading-none text-muted-fg hover:text-fg"
        >
          ×
        </button>
      </div>
      <dl className="mt-5 space-y-3 text-sm">
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-fg">Area</dt>
          <dd className="mt-0.5">{areaName ?? "—"}</dd>
        </div>
        {space.capacity !== null ? (
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-fg">Seats</dt>
            <dd className="mt-0.5">{space.capacity}</dd>
          </div>
        ) : null}
      </dl>
    </aside>
  );
}

const pill = (active: boolean) =>
  `rounded-md border px-2.5 py-1 text-sm ${
    active ? "border-primary bg-primary text-primary-fg" : "border-border hover:bg-muted"
  }`;

function MapNavigation({
  locations,
  locationSlug,
  floorSlug,
  areas,
  areaSlug,
  onFloor,
  onArea,
}: {
  locations: MapLocation[];
  locationSlug: string;
  floorSlug: string;
  areas: { slug: string; name: string }[];
  areaSlug: string | null;
  onFloor: (loc: string, floor: string | null) => void;
  onArea: (area: string | null) => void;
}) {
  const location = locations.find((l) => l.slug === locationSlug);
  const floors = location?.floors.filter((f) => f.hasDrawing) ?? [];
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
      {locations.length > 1 ? (
        <select
          aria-label="Office"
          value={locationSlug}
          onChange={(e) => onFloor(e.target.value, null)}
          className="rounded-md border border-border bg-transparent px-3 py-1.5 text-sm"
        >
          {locations.map((l) => (
            <option key={l.slug} value={l.slug}>
              {l.name}
            </option>
          ))}
        </select>
      ) : null}
      <div role="group" aria-label="Floors" className="flex flex-wrap gap-1">
        {floors.map((f) => (
          <button
            key={f.slug}
            type="button"
            aria-pressed={f.slug === floorSlug}
            onClick={() => f.slug !== floorSlug && onFloor(locationSlug, f.slug)}
            className={pill(f.slug === floorSlug)}
          >
            {f.name}
          </button>
        ))}
      </div>
      {areas.length > 0 ? (
        <div role="group" aria-label="Areas" className="flex flex-wrap gap-1">
          <button
            type="button"
            aria-pressed={areaSlug === null}
            onClick={() => onArea(null)}
            className={pill(areaSlug === null)}
          >
            Whole floor
          </button>
          {areas.map((a) => (
            <button
              key={a.slug}
              type="button"
              aria-pressed={a.slug === areaSlug}
              onClick={() => onArea(a.slug)}
              className={pill(a.slug === areaSlug)}
            >
              {a.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// Shown when nothing is selected: the office's floors at a glance. Free-room counts need live
// room status, which arrives with the Google integration (Phase 4).
function OfficeOverview({
  location,
  currentFloor,
  seats,
  onFloor,
}: {
  location: MapLocation;
  currentFloor: string;
  seats: MapSeat[];
  onFloor: (loc: string, floor: string | null) => void;
}) {
  return (
    <aside aria-label={`${location.name} overview`} className="rounded-lg border border-border p-5">
      <h2 className="text-lg font-heading">{location.name}</h2>
      <p className="text-sm text-muted-fg">{location.regionLabel}</p>
      <table className="mt-4 w-full text-left text-sm">
        <thead className="border-b border-border text-xs uppercase text-muted-fg">
          <tr>
            <th className="py-1.5 pr-2 font-medium">Floor</th>
            <th className="py-1.5 pr-2 text-right font-medium">People</th>
            <th className="py-1.5 pr-2 text-right font-medium">Desks</th>
            <th className="py-1.5 text-right font-medium">Rooms</th>
          </tr>
        </thead>
        <tbody>
          {location.floors.map((f) => {
            const people = seats.filter(
              (s) => s.locationSlug === location.slug && s.floorSlug === f.slug,
            ).length;
            return (
              <tr key={f.slug} className="border-b border-border last:border-0">
                <td className="py-1.5 pr-2">
                  {f.slug === currentFloor || !f.hasDrawing ? (
                    <span className={f.slug === currentFloor ? "font-medium" : "text-muted-fg"}>
                      {f.name}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onFloor(location.slug, f.slug)}
                      className="underline underline-offset-4"
                    >
                      {f.name}
                    </button>
                  )}
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{people}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{f.deskCount}</td>
                <td className="py-1.5 text-right tabular-nums">{f.roomCount}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-4 text-sm text-muted-fg">Select a desk or a room on the map.</p>
    </aside>
  );
}

function TeamHighlight({
  teams,
  teamId,
  includeSubteams,
  result,
  currentFloor,
  onChange,
  onFloor,
}: {
  teams: DirectoryTeam[];
  teamId: string | null;
  includeSubteams: boolean;
  result: TeamSeats | null;
  currentFloor: { loc: string; floor: string };
  onChange: (teamId: string | null, includeSubteams: boolean) => void;
  onFloor: (loc: string, floor: string) => void;
}) {
  const name = teams.find((t) => t.id === teamId)?.name;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      <select
        aria-label="Highlight team"
        value={teamId ?? ""}
        onChange={(e) => onChange(e.target.value || null, includeSubteams)}
        className="rounded-md border border-border bg-transparent px-3 py-1.5 text-sm"
      >
        <option value="">Highlight a team…</option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={includeSubteams}
          disabled={!teamId}
          onChange={(e) => onChange(teamId, e.target.checked)}
        />
        Include sub-teams
      </label>
      {result && name ? (
        <p
          role="status"
          aria-label="Team seats"
          className="flex flex-wrap items-center gap-x-2 gap-y-1"
        >
          <span className="font-medium">
            {name}
            {includeSubteams ? " and sub-teams" : ""}: {result.seats.length}{" "}
            {result.seats.length === 1 ? "seat" : "seats"}
          </span>
          {result.perFloor.map((f) => {
            const here = f.locationSlug === currentFloor.loc && f.floorSlug === currentFloor.floor;
            const label = `${f.floorName}: ${f.count}`;
            return here ? (
              <span
                key={`${f.locationSlug}/${f.floorSlug}`}
                className="rounded bg-map-highlight px-1.5 text-bg"
              >
                {label}
              </span>
            ) : (
              <button
                key={`${f.locationSlug}/${f.floorSlug}`}
                type="button"
                onClick={() => onFloor(f.locationSlug, f.floorSlug)}
                className="rounded bg-muted px-1.5 underline underline-offset-2"
              >
                {label}
              </button>
            );
          })}
          {result.deskless > 0 ? (
            <span className="text-muted-fg">· {result.deskless} without a desk</span>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
