"use client";

import { useMemo, useTransition } from "react";
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

export function MapView({ map, people }: Props) {
  // Selection is client-only state in the URL. Changing floors needs the server's drawing, so
  // those updates opt out of shallow routing where they're made.
  const [params, setParams] = useQueryStates(mapParsers, { history: "replace" });
  const [navigating, startTransition] = useTransition();
  const floor = map.floor;

  // A new floor comes from the server. The area and room picked on the old floor don't apply.
  function goTo(loc: string, floorSlug: string | null) {
    void setParams(
      { loc, floor: floorSlug, area: null, space: null },
      { shallow: false, startTransition },
    );
  }

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
        highlighted: [],
        selected: [personSeatHere?.svgElementId, selectedSpace?.svgElementId].filter(
          (id): id is string => !!id,
        ),
      }),
    [personSeatHere, selectedSpace],
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
            emphasis: seat.personId === params.person ? ("selected" as const) : null,
            dimmed: focusArea !== null && seat.areaSlug !== focusArea.slug,
          },
        ];
      }),
    [seatsHere, peopleById, params.person, focusArea],
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
