"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { FloorDiff } from "@orov/core";
import type { TierLabels } from "@orov/core/spaces/tier";
import {
  applyUploadAction,
  previewRollbackAction,
  previewUploadAction,
  editDrawingAction,
  rollbackAction,
  type PreviewState,
} from "@/app/admin/floors/actions";
import type { DrawingEditInput } from "@orov/core/svg/edit-input";
import { DrawingEditor } from "./drawing-editor";

interface Version {
  id: string;
  version: number;
  uploadedBy: string;
  // Formatted on the server in the viewer's date format and time zone (#27).
  uploadedLabel: string;
}

interface Props {
  floorId: string;
  // What the office calls its floors (#16).
  tier: TierLabels;
  currentAssetId: string | null;
  versions: Version[];
  // The current version's sanitized drawing, to edit in the browser (#21).
  currentSvg: string | null;
}

// What the admin is about to apply: a new file, or an earlier version.
type Pending =
  | {
      kind: "upload";
      fileName: string;
      svg: string;
      preview: Extract<PreviewState, { ok: true }>;
      // Made with the editor rather than uploaded; later edits build on it.
      edited?: boolean;
    }
  | { kind: "rollback"; version: Version; preview: Extract<PreviewState, { ok: true }> };

// Upload a drawing or roll back to an earlier one. Both show the diff first, and nothing is
// written until the admin applies it (plan.md §6, U11).
export function FloorDrawingPanel({ floorId, tier, currentAssetId, versions, currentSvg }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<Pending | null>(null);
  const [confirmDeskless, setConfirmDeskless] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const [busy, startTransition] = useTransition();
  const [fileKey, setFileKey] = useState(0);

  function reset() {
    setPending(null);
    setConfirmDeskless(false);
    setFileKey((k) => k + 1);
  }

  function chooseFile(file: File | undefined) {
    if (!file) return;
    setMessage(null);
    startTransition(async () => {
      const svg = await file.text();
      const preview = await previewUploadAction(floorId, svg);
      if (!preview.ok) {
        setMessage({ tone: "error", text: preview.error });
        reset();
        return;
      }
      setConfirmDeskless(false);
      setPending({ kind: "upload", fileName: file.name, svg, preview });
    });
  }

  // One edit at a time, each on top of the edits not yet applied.
  const editBase = pending?.kind === "upload" && pending.edited ? pending.svg : null;
  function editDrawing(edit: DrawingEditInput) {
    setMessage(null);
    startTransition(async () => {
      const result = await editDrawingAction(floorId, editBase, edit);
      if (!result.ok) {
        setMessage({ tone: "error", text: result.error });
        return;
      }
      setConfirmDeskless(false);
      setPending({ kind: "upload", fileName: "your edits", svg: result.svg, preview: result, edited: true });
      setMessage({
        tone: "info",
        text: `${edit.kind === "remove" ? "Removed" : "Added"} ${result.svgElementId}. Keep editing, or review the changes below and apply them.`,
      });
    });
  }

  function chooseVersion(version: Version) {
    setMessage(null);
    startTransition(async () => {
      const preview = await previewRollbackAction(floorId, version.id);
      if (!preview.ok) {
        setMessage({ tone: "error", text: preview.error });
        return;
      }
      setConfirmDeskless(false);
      setPending({ kind: "rollback", version, preview });
    });
  }

  function apply() {
    if (!pending) return;
    startTransition(async () => {
      const result =
        pending.kind === "upload"
          ? await applyUploadAction(floorId, pending.svg, confirmDeskless)
          : await rollbackAction(floorId, pending.version.id, confirmDeskless);
      if (!result.ok) {
        setMessage({ tone: "error", text: result.error });
        return;
      }
      setMessage({
        tone: "info",
        text:
          pending.kind === "upload"
            ? `Saved as version ${result.version}.`
            : `Rolled back to version ${result.version}.`,
      });
      reset();
      router.refresh();
    });
  }

  const diff = pending?.preview.diff;
  const blockedByErrors = (diff?.errors.length ?? 0) > 0;
  const needsConfirm = (diff?.spaces.removedAssigned.length ?? 0) > 0;
  const identical = pending?.kind === "upload" && pending.preview.identical;
  const canApply =
    !!pending && !blockedByErrors && !identical && (!needsConfirm || confirmDeskless);

  return (
    <div className="space-y-6">
      <section aria-labelledby="upload-heading" className="rounded-lg border border-border p-5">
        <h2 id="upload-heading" className="font-heading">
          Upload a drawing
        </h2>
        <p className="mt-1 text-sm text-muted-fg">
          An SVG drawn to the rules in <code className="font-mono">docs/map-authoring.md</code>.
          You&apos;ll see what changes before anything is saved.
        </p>
        <input
          key={fileKey}
          type="file"
          accept=".svg,image/svg+xml"
          aria-label={`${tier.singular} drawing (SVG)`}
          disabled={busy}
          onChange={(e) => chooseFile(e.target.files?.[0])}
          className="mt-3 block text-sm"
        />
      </section>

      {currentSvg ? (
        <section aria-labelledby="edit-heading" className="rounded-lg border border-border p-5">
          <h2 id="edit-heading" className="font-heading">
            Edit the drawing here
          </h2>
          <p className="mt-1 text-sm text-muted-fg">
            Add desks and rooms, or remove them, without going back to the drawing tool. Your edits become a new
            version once you apply them, like an upload.
          </p>
          <div className="mt-3">
            <DrawingEditor
              svg={editBase ?? currentSvg}
              busy={busy}
              onEdit={editDrawing}
            />
          </div>
        </section>
      ) : null}

      {message ? (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={`rounded-md p-3 text-sm ${
            message.tone === "error" ? "bg-destructive/10 text-destructive" : "bg-muted"
          }`}
        >
          {message.text}
        </p>
      ) : null}

      {pending && diff ? (
        <section aria-labelledby="diff-heading" className="rounded-lg border border-border p-5">
          <h2 id="diff-heading" className="font-heading">
            {pending.kind === "upload"
              ? `Changes from ${pending.fileName}`
              : `Changes from rolling back to version ${pending.version.version}`}
          </h2>

          <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <FloorDiffView diff={diff} identical={identical} />
            {/* An <img> never runs scripts, so the preview is safe even before the admin applies it. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt="Preview of the drawing"
              src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(pending.preview.sanitizedSvg)}`}
              className="w-full rounded-md border border-border bg-map-bg"
            />
          </div>

          {needsConfirm ? (
            <label className="mt-4 flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={confirmDeskless}
                onChange={(e) => setConfirmDeskless(e.target.checked)}
              />
              <span>
                The people listed under &ldquo;Removed, still assigned&rdquo; will have no desk.
                Move them to another desk first if they should keep one.
              </span>
            </label>
          ) : null}

          <div className="mt-5 flex items-center gap-3">
            <button
              type="button"
              onClick={apply}
              disabled={!canApply || busy}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg disabled:opacity-50"
            >
              {busy ? "Applying…" : pending.kind === "upload" ? "Apply drawing" : "Roll back"}
            </button>
            <button type="button" onClick={reset} disabled={busy} className="text-sm underline">
              Cancel
            </button>
          </div>
        </section>
      ) : null}

      <section aria-labelledby="versions-heading">
        <h2 id="versions-heading" className="font-heading">
          Versions
        </h2>
        {versions.length === 0 ? (
          <p className="mt-2 text-sm text-muted-fg">No drawing yet.</p>
        ) : (
          <table className="mt-2 w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted-fg">
              <tr>
                <th className="py-2 pr-3 font-medium">Version</th>
                <th className="py-2 pr-3 font-medium">Uploaded</th>
                <th className="py-2 pr-3 font-medium">By</th>
                <th className="py-2 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.id} className="border-b border-border">
                  <td className="py-2 pr-3 tabular-nums">
                    {v.version}{" "}
                    {v.id === currentAssetId ? (
                      <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-xs font-medium">
                        current
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3">{v.uploadedLabel}</td>
                  <td className="py-2 pr-3">{v.uploadedBy}</td>
                  <td className="py-2 text-right">
                    {v.id === currentAssetId ? null : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => chooseVersion(v)}
                        className="underline"
                      >
                        Roll back to version {v.version}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function FloorDiffView({ diff, identical }: { diff: FloorDiff; identical: boolean }) {
  const groups: { title: string; items: string[]; tone?: "warn" }[] = [
    {
      title: "Added",
      items: [
        ...diff.areas.added.map((a) => `Area ${a.name}`),
        ...diff.spaces.added.map((s) => (s.restoreId ? `${s.name} (restored)` : s.name)),
      ],
    },
    {
      title: "Moved to another area",
      items: diff.spaces.moved.map(
        (m) => `${m.space.name}: ${m.from ?? "no area"} → ${m.to ?? "no area"}`,
      ),
    },
    {
      title: "Removed, will be archived",
      items: [
        ...diff.areas.removed.map((a) => `Area ${a.name}`),
        ...diff.spaces.removedUnassigned.map((s) => s.name),
      ],
    },
    {
      title: "Removed, still assigned",
      items: diff.spaces.removedAssigned.map((s) => `${s.name}: ${s.assignedTo!.name}`),
      tone: "warn",
    },
  ];
  const unchanged = diff.spaces.unchanged.length;

  return (
    <div className="space-y-4 text-sm">
      {diff.errors.length > 0 ? (
        <div role="alert" className="rounded-md bg-destructive/10 p-3 text-destructive">
          <p className="font-medium">Fix these in the drawing and upload it again:</p>
          <ul className="mt-1 list-disc pl-5">
            {diff.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {identical ? (
        <p className="rounded-md bg-muted p-3">This drawing is the same as the current version.</p>
      ) : null}
      {groups
        .filter((g) => g.items.length > 0)
        .map((g) => (
          <div key={g.title}>
            <h3 className={`font-medium ${g.tone === "warn" ? "text-destructive" : ""}`}>
              {g.title} ({g.items.length})
            </h3>
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {g.items.map((item) => (
                <li key={item} className="rounded bg-muted px-1.5 py-0.5 text-xs">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      <p className="text-muted-fg">
        {unchanged} {unchanged === 1 ? "space is" : "spaces are"} unchanged.
      </p>
    </div>
  );
}
