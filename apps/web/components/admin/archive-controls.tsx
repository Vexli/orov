"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteAction, setArchivedAction, type ArchiveState } from "@/app/admin/locations/actions";

interface Props {
  kind: "floor" | "office";
  id: string;
  // "Floor 3", "London".
  name: string;
  archived: boolean;
  // Only something that never had a drawing can be deleted; the rest is archived.
  deletable: boolean;
  // Where to go after a delete.
  afterDelete: string;
}

// Archive, unarchive or delete a floor or office (#22). Archiving makes anyone with a desk there
// deskless, so the first attempt lists them and asks the admin to confirm.
export function ArchiveControls({ kind, id, name, archived, deletable, afterDelete }: Props) {
  const router = useRouter();
  const [state, setState] = useState<ArchiveState | null>(null);
  const [pending, startTransition] = useTransition();
  const target = { kind, id };
  const deskless = state && !state.ok ? state.deskless : undefined;

  function archive(value: boolean, confirm = false) {
    startTransition(async () => {
      const result = await setArchivedAction(target, value, confirm);
      setState(result);
      if (result.ok) router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteAction(target);
      if (result.ok) router.push(afterDelete);
      else setState(result);
    });
  }

  const button = "rounded-md border border-border px-3 py-2 text-sm disabled:opacity-40";
  return (
    <div className="space-y-3">
      {archived ? (
        <p className="text-sm">
          {name} is archived: it&apos;s hidden from the map, the directory, search and the seat picker.
        </p>
      ) : (
        <p className="text-sm text-muted-fg">
          Archiving hides {name} everywhere but keeps its history. You can unarchive it later.
        </p>
      )}
      {state && !state.ok ? (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        {archived ? (
          <button type="button" className={button} disabled={pending} onClick={() => archive(false)}>
            Unarchive {kind}
          </button>
        ) : deskless ? (
          <button type="button" className={button} disabled={pending} onClick={() => archive(true, true)}>
            Archive and leave them without a desk
          </button>
        ) : (
          <button type="button" className={button} disabled={pending} onClick={() => archive(true)}>
            Archive {kind}
          </button>
        )}
        {deletable ? (
          <button type="button" className={`${button} text-destructive`} disabled={pending} onClick={remove}>
            Delete {kind}
          </button>
        ) : null}
      </div>
      {!deletable ? (
        <p className="text-xs text-muted-fg">
          It can&apos;t be deleted, because it has had a drawing and its history is kept.
        </p>
      ) : null}
    </div>
  );
}
