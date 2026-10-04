"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { SeatingMove } from "@officeorg/db/queries/seating";
import { applySeatingAction, previewSeatingAction } from "@/app/admin/locations/[id]/seating/actions";

interface Props {
  locationId: string;
  people: { id: string; name: string; teamName: string | null }[];
}

const button = "rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg disabled:opacity-50";

export function SeatingPlanner({ locationId, people }: Props) {
  const router = useRouter();
  const [locked, setLocked] = useState<ReadonlySet<string>>(new Set());
  const [moves, setMoves] = useState<SeatingMove[] | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(id: string, on: boolean) {
    setMoves(null);
    setLocked((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function plan() {
    setMessage(null);
    startTransition(async () => {
      const result = await previewSeatingAction(locationId, [...locked]);
      if (result.ok) setMoves(result.moves);
      else setMessage({ tone: "error", text: result.error });
    });
  }

  function apply() {
    if (!moves) return;
    startTransition(async () => {
      const result = await applySeatingAction(
        locationId,
        moves.map((m) => ({ personId: m.personId, deskId: m.toDeskId })),
      );
      if (!result.ok) {
        setMessage({ tone: "error", text: result.error });
        return;
      }
      setMoves(null);
      setMessage({ tone: "info", text: `Done: ${result.moved} ${result.moved === 1 ? "person" : "people"} moved.` });
      router.refresh();
    });
  }

  return (
    <div className="mt-6 space-y-6">
      <fieldset>
        <legend className="text-sm font-medium">Keep in place</legend>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {people.map((p) => (
            <li key={p.id}>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={locked.has(p.id)} onChange={(e) => toggle(p.id, e.target.checked)} />
                <span>
                  Keep {p.name} in place <span className="text-muted-fg">{p.teamName ?? "No team"}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <button type="button" className={button} disabled={pending} onClick={plan}>
        {pending && !moves ? "Planning…" : "Plan seating"}
      </button>
      {message ? (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={`rounded-md p-3 text-sm ${message.tone === "error" ? "bg-destructive/10 text-destructive" : "bg-muted"}`}
        >
          {message.text}
        </p>
      ) : null}
      {moves ? (
        moves.length === 0 ? (
          <p role="status" className="rounded-md bg-muted p-3 text-sm">
            Everyone already sits with their team. Nothing to move.
          </p>
        ) : (
          <section aria-labelledby="moves-heading">
            <h2 id="moves-heading" className="font-heading">
              {moves.length} {moves.length === 1 ? "move" : "moves"}
            </h2>
            <table className="mt-2 w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase text-muted-fg">
                <tr>
                  <th className="py-2 pr-3 font-medium">Person</th>
                  <th className="py-2 pr-3 font-medium">Team</th>
                  <th className="py-2 pr-3 font-medium">From</th>
                  <th className="py-2 font-medium">To</th>
                </tr>
              </thead>
              <tbody>
                {moves.map((m) => (
                  <tr key={m.personId} className="border-b border-border">
                    <td className="py-2 pr-3">{m.name}</td>
                    <td className="py-2 pr-3">{m.teamName ?? "—"}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{m.fromCode ?? "—"}</td>
                    <td className="py-2 font-mono text-xs">
                      {m.toCode} <span className="font-sans text-muted-fg">{m.toFloor}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button type="button" className={`${button} mt-4`} disabled={pending} onClick={apply}>
              {pending ? "Moving…" : "Apply these moves"}
            </button>
          </section>
        )
      ) : null}
    </div>
  );
}
