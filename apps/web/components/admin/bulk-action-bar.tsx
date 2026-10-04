"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import type { BulkPatch } from "@officeorg/core/people/bulk";
import { bulkUpdatePeopleAction } from "@/app/admin/people/actions";
import { sortByName } from "@officeorg/core/people/names";

type Action =
  | "deactivate"
  | "activate"
  | "setManager"
  | "clearManager"
  | "addTeam"
  | "removeTeam"
  | "setPrimaryTeam";

const ACTIONS: { value: Action; label: string; needs: "manager" | "team" | null }[] = [
  { value: "deactivate", label: "Deactivate", needs: null },
  { value: "activate", label: "Activate", needs: null },
  { value: "setManager", label: "Set manager", needs: "manager" },
  { value: "clearManager", label: "Clear manager (use the team lead)", needs: null },
  { value: "addTeam", label: "Add to team", needs: "team" },
  { value: "removeTeam", label: "Remove from team", needs: "team" },
  { value: "setPrimaryTeam", label: "Set primary team", needs: "team" },
];

interface Props {
  selected: { id: string; name: string }[];
  managers: { id: string; name: string }[];
  teams: { id: string; name: string }[];
  onDone: (message: string) => void;
}

const control = "rounded-md border border-border bg-card px-3 py-2 text-sm text-card-fg";

// A change for every selected person (#7), confirmed in a dialog that lists who it applies to,
// the same "look before you write" step as an import's dry run.
export function BulkActionBar({ selected, managers, teams, onDone }: Props) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [action, setAction] = useState<Action>("deactivate");
  const [target, setTarget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const spec = ACTIONS.find((a) => a.value === action)!;
  const options = spec.needs === "manager" ? managers : spec.needs === "team" ? teams : [];
  const targetName = options.find((o) => o.id === target)?.name;
  const ready = spec.needs === null || targetName !== undefined;

  function patch(): BulkPatch {
    switch (action) {
      case "deactivate":
        return { active: false };
      case "activate":
        return { active: true };
      case "setManager":
        return { managerId: target };
      case "clearManager":
        return { managerId: null };
      case "addTeam":
        return { addTeamIds: [target] };
      case "removeTeam":
        return { removeTeamIds: [target] };
      case "setPrimaryTeam":
        return { primaryTeamId: target };
    }
  }

  const summary = `${spec.label}${targetName ? `: ${targetName}` : ""}`;

  function apply() {
    setError(null);
    startTransition(async () => {
      const result = await bulkUpdatePeopleAction(
        selected.map((p) => p.id),
        patch(),
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      dialog.current?.close();
      onDone(
        `${summary} · ${result.updated} ${result.updated === 1 ? "person" : "people"} updated.`,
      );
      router.refresh();
    });
  }

  return (
    <div
      role="region"
      aria-label="Change selected people"
      className="sticky bottom-0 z-10 mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3 text-card-fg"
    >
      <span className="text-sm font-medium">{selected.length} selected</span>
      <select
        aria-label="Change"
        className={control}
        value={action}
        onChange={(e) => {
          setAction(e.target.value as Action);
          setTarget("");
        }}
      >
        {ACTIONS.map((a) => (
          <option key={a.value} value={a.value}>
            {a.label}
          </option>
        ))}
      </select>
      {spec.needs ? (
        <select
          aria-label={spec.needs === "manager" ? "New manager" : "Team"}
          className={control}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        >
          <option value="">
            {spec.needs === "manager" ? "Choose a manager" : "Choose a team"}
          </option>
          {sortByName(options).map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      ) : null}
      <button
        type="button"
        disabled={!ready}
        onClick={() => {
          setError(null);
          dialog.current?.showModal();
        }}
        className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-fg disabled:opacity-40"
      >
        Review change
      </button>

      <dialog
        ref={dialog}
        aria-labelledby="bulk-dialog-title"
        className="m-auto max-w-lg rounded-lg border border-border bg-card p-5 text-card-fg backdrop:bg-fg/40"
      >
        <h2 id="bulk-dialog-title" className="font-heading">
          {summary} for {selected.length} {selected.length === 1 ? "person" : "people"}?
        </h2>
        <ul className="mt-3 max-h-60 list-disc overflow-y-auto pl-5 text-sm">
          {selected.map((p) => (
            <li key={p.id}>{p.name}</li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-fg">
          Everyone is checked as if edited one by one. If any of them can&apos;t be changed, nobody
          is.
        </p>
        {error ? (
          <p
            role="alert"
            className="mt-3 rounded-md bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}
        <div className="mt-4 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            className="rounded-md border border-border px-3 py-2 text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={pending}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-fg disabled:opacity-40"
          >
            {pending ? "Applying…" : "Apply"}
          </button>
        </div>
      </dialog>
    </div>
  );
}
