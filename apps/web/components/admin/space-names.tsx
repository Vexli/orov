"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveAreaAction, saveSpaceAction, type RenameState } from "@/app/admin/floors/actions";

interface Row {
  id: string;
  name: string;
  svgElementId: string;
  // Spaces only; areas have none.
  kind?: string;
  capacity?: number | null;
}

const KIND_LABEL: Record<string, string> = {
  meeting_room: "Meeting room",
  phone_booth: "Phone booth",
  kitchen: "Kitchen",
  elevator: "Elevator",
  restroom: "Restroom",
  other: "Other",
};

const input = "w-full rounded-md border border-border bg-transparent px-2 py-1 text-sm";

// Names of a floor's areas, rooms and points of interest, edited in place (#21). The map, cards,
// lists and search show these names; the drawing's ids don't change, so a later upload of the
// same drawing keeps them. Desks aren't here: their names are codes.
export function SpaceNames({ floorId, areas, spaces }: { floorId: string; areas: Row[]; spaces: Row[] }) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border text-xs uppercase text-muted-fg">
          <tr>
            <th className="py-2 pr-3 font-medium">Name</th>
            <th className="py-2 pr-3 font-medium">Kind</th>
            <th className="py-2 pr-3 font-medium">Seats</th>
            <th className="py-2 pr-3 font-medium">Drawing id</th>
            <th className="py-2 font-medium">
              <span className="sr-only">Save</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {areas.map((a) => (
            <NameRow key={a.id} floorId={floorId} row={a} area />
          ))}
          {spaces.map((sp) => (
            <NameRow key={sp.id} floorId={floorId} row={sp} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NameRow({ floorId, row, area = false }: { floorId: string; row: Row; area?: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(row.name);
  const [capacity, setCapacity] = useState(row.capacity == null ? "" : String(row.capacity));
  const [state, setState] = useState<RenameState | null>(null);
  const [pending, startTransition] = useTransition();
  const hasCapacity = row.kind === "meeting_room" || row.kind === "phone_booth";
  const dirty = name !== row.name || (hasCapacity && capacity !== (row.capacity == null ? "" : String(row.capacity)));

  function save(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = area
        ? await saveAreaAction(floorId, row.id, { name })
        : await saveSpaceAction(floorId, row.id, { name, capacity: hasCapacity ? capacity : (row.capacity ?? null) });
      setState(result);
      if (result.ok) router.refresh();
    });
  }

  const formId = `rename-${row.id}`;
  return (
    <tr className="border-b border-border align-top">
      <td className="py-2 pr-3">
        <form id={formId} onSubmit={save} />
        <input
          form={formId}
          className={input}
          aria-label={`Name of ${row.svgElementId}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {state && !state.ok ? <p className="mt-1 text-xs text-destructive">{state.error}</p> : null}
      </td>
      <td className="py-2 pr-3 text-muted-fg">{area ? "Area" : (KIND_LABEL[row.kind ?? ""] ?? row.kind)}</td>
      <td className="py-2 pr-3">
        {hasCapacity ? (
          <input
            form={formId}
            type="number"
            min={1}
            className={`${input} max-w-20`}
            aria-label={`Seats in ${row.name}`}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
          />
        ) : (
          <span className="text-muted-fg">—</span>
        )}
      </td>
      <td className="py-2 pr-3 font-mono text-xs text-muted-fg">{row.svgElementId}</td>
      <td className="py-2 text-right">
        <button
          form={formId}
          type="submit"
          disabled={!dirty || pending}
          className="rounded-md border border-border px-2 py-1 text-xs disabled:opacity-40"
        >
          {pending ? "Saving…" : state?.ok && !dirty ? "Saved" : "Save"}
        </button>
      </td>
    </tr>
  );
}
