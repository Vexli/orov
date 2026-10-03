"use client";

import type { DirectoryPerson, MapArea, MapSeat, MapSpace } from "@officeorg/core";
import { displayName } from "@officeorg/core/directory/filter";

// The floor's desks and rooms as a table, for keyboard and screen reader users (plan.md §6). It
// shows the same state as the drawing (the open area, the selection, the highlighted team), and
// choosing a row does exactly what clicking the shape on the map does.

export const KIND_LABEL: Record<MapSpace["kind"], string> = {
  desk: "Desk",
  meeting_room: "Meeting room",
  phone_booth: "Phone booth",
  kitchen: "Kitchen",
  elevator: "Elevator",
  restroom: "Restroom",
  other: "Point of interest",
};

// Kitchens, elevators and restrooms aren't things anyone selects, so the list leaves them out.
const LISTED = new Set<MapSpace["kind"]>(["desk", "meeting_room", "phone_booth"]);

interface Props {
  floorName: string;
  spaces: MapSpace[];
  areas: MapArea[];
  seats: MapSeat[];
  peopleById: Map<string, DirectoryPerson>;
  // Only rows in this area, when one is open.
  areaId: string | null;
  selectedSvgId: string | null;
  highlightedPersonIds: Set<string>;
  onSelect: (svgElementId: string) => void;
}

export function FloorList({
  floorName,
  spaces,
  areas,
  seats,
  peopleById,
  areaId,
  selectedSvgId,
  highlightedPersonIds,
  onSelect,
}: Props) {
  const seatBySvg = new Map(seats.map((s) => [s.svgElementId, s]));
  const areaName = new Map(areas.map((a) => [a.id, a.name]));
  const rows = spaces.filter((s) => LISTED.has(s.kind) && (areaId === null || s.areaId === areaId));

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Desks and rooms on {floorName}</caption>
        <thead className="border-b border-border bg-muted text-xs uppercase text-muted-fg">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              Desk or room
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Type
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Area
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Person
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((space) => {
            const seat = space.kind === "desk" ? seatBySvg.get(space.svgElementId) : undefined;
            const person = seat ? peopleById.get(seat.personId) : undefined;
            const selected = space.svgElementId === selectedSvgId;
            const inTeam = !!seat && highlightedPersonIds.has(seat.personId);
            return (
              <tr
                key={space.id}
                aria-current={selected ? "true" : undefined}
                className={`border-b border-border last:border-0 ${selected ? "bg-accent" : ""}`}
              >
                <th scope="row" className="px-3 py-2 font-medium">
                  <button
                    type="button"
                    onClick={() => onSelect(space.svgElementId)}
                    className="underline underline-offset-4"
                  >
                    {space.name}
                  </button>
                </th>
                <td className="px-3 py-2">
                  {KIND_LABEL[space.kind]}
                  {space.capacity !== null && space.kind !== "desk"
                    ? ` · ${space.capacity} seats`
                    : ""}
                </td>
                <td className="px-3 py-2">
                  {space.areaId ? (areaName.get(space.areaId) ?? "—") : "—"}
                </td>
                <td className="px-3 py-2">
                  {person ? (
                    <span className="inline-flex items-center gap-2">
                      {displayName(person)}{" "}
                      {inTeam ? (
                        <span className="rounded bg-map-highlight px-1.5 py-0.5 text-xs text-bg">
                          In team
                        </span>
                      ) : null}
                    </span>
                  ) : space.kind === "desk" ? (
                    <span className="text-muted-fg">Free</span>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            );
          })}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-3 py-8 text-center text-muted-fg">
                No desks or rooms here.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
