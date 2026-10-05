"use client";

import { useMemo, useState } from "react";
import { mapStateCss } from "@orov/core/map/state-css";
import type { DeskOption, PickerFloor } from "@orov/db/queries/spaces";
import { Drawing } from "@/components/map/floor-map";

interface Props {
  desks: DeskOption[];
  floors: PickerFloor[];
  // The person being edited. Undefined for a new person.
  personId?: string;
  value: string | null;
  swap: boolean;
  onChange: (deskId: string | null) => void;
  onSwapChange: (swap: boolean) => void;
  error?: React.ReactNode;
}

const inputClass = "mt-1 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm";

// Desk assignment by clicking a floor's drawing, with a select as the keyboard and screen reader
// route to the same choice. A desk someone else holds can be chosen too: the admin then confirms
// a swap, and the holder takes this person's old desk (plan.md §5, one person per desk).
export function SeatPicker({
  desks,
  floors,
  personId,
  value,
  swap,
  onChange,
  onSwapChange,
  error,
}: Props) {
  const chosen = desks.find((d) => d.id === value) ?? null;
  const [floorId, setFloorId] = useState(chosen?.floorId ?? floors[0]?.id ?? null);
  const floor = floors.find((f) => f.id === floorId) ?? null;

  const ownDesk = personId ? (desks.find((d) => d.assignedPersonId === personId) ?? null) : null;
  const holder =
    chosen && chosen.assignedPersonId && chosen.assignedPersonId !== personId
      ? { id: chosen.assignedPersonId, name: chosen.assignedPersonName! }
      : null;

  const css = useMemo(() => {
    const onFloor = desks.filter((d) => d.floorId === floorId);
    return mapStateCss({
      occupied: onFloor
        .filter((d) => d.assignedPersonId && d.assignedPersonId !== personId)
        .map((d) => d.svgElementId),
      highlighted: [],
      selected: chosen && chosen.floorId === floorId ? [chosen.svgElementId] : [],
    });
  }, [desks, floorId, chosen, personId]);

  function choose(deskId: string | null) {
    onChange(deskId);
    onSwapChange(false);
  }

  function handleMapClick(e: React.MouseEvent) {
    const target = (e.target as Element).closest('[id^="desk-"]');
    if (!target) return;
    const desk = desks.find((d) => d.floorId === floorId && d.svgElementId === target.id);
    if (desk) choose(desk.id);
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium">
        Desk
        <select
          className={inputClass}
          value={value ?? ""}
          onChange={(e) => choose(e.target.value || null)}
        >
          <option value="">No desk (remote or deskless)</option>
          {desks.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
              {d.assignedPersonId && d.assignedPersonId !== personId
                ? ` (${d.assignedPersonName})`
                : ""}
            </option>
          ))}
        </select>
        {error}
      </label>

      {floors.length > 0 ? (
        <div>
          <div role="group" aria-label="Seat picker floor" className="flex flex-wrap gap-1">
            {floors.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={f.id === floorId}
                onClick={() => setFloorId(f.id)}
                className={`rounded-md border px-2 py-0.5 text-xs ${
                  f.id === floorId ? "border-primary bg-primary text-primary-fg" : "border-border"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          {floor ? (
            // Mouse users click a desk; the select above is the accessible way to the same choice.
            <div
              data-floor-map=""
              data-seat-picker=""
              aria-hidden="true"
              onClick={handleMapClick}
              className="mt-2 overflow-hidden rounded-md border border-border bg-map-bg"
            >
              <style>{css}</style>
              <Drawing key={floor.assetId} svg={floor.svg} />
            </div>
          ) : null}
          <p className="mt-1 text-xs text-muted-fg">
            Click a desk to choose it. Shaded desks belong to someone else.
          </p>
        </div>
      ) : null}

      {holder ? (
        <label className="flex items-start gap-2 rounded-md bg-muted p-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={swap}
            onChange={(e) => onSwapChange(e.target.checked)}
          />
          <span>
            {chosen!.name} is {holder.name}&apos;s desk. Swap desks: {holder.name}{" "}
            {ownDesk ? `moves to ${ownDesk.name}` : "will have no desk"}.
          </span>
        </label>
      ) : null}
    </div>
  );
}
