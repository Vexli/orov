"use client";

import { useMemo } from "react";
import { useQueryStates } from "nuqs";
import type { DirectoryPerson, DirectoryTeam, MapData, MapSpace } from "@officeorg/core";
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
  const floor = map.floor;

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
          },
        ];
      }),
    [seatsHere, peopleById, params.person],
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
      <section aria-label="Floor map" className="min-w-0">
        <h1 className="text-xl font-heading">
          {floor.locationName}, {floor.name}
        </h1>
        <div className="mt-4">
          <FloorMap
            assetId={floor.assetId}
            svg={floor.svg}
            stateCss={stateCss}
            avatars={avatars}
            label={`Floor plan of ${floor.locationName}, ${floor.name}`}
            onSelect={select}
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
          <p className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-fg">
            Select a desk or a room on the map.
          </p>
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
