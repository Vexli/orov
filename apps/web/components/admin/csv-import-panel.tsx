"use client";

import { useState, useTransition } from "react";
import type { FieldChange, ImportPlan, PersonRecord, TeamRecord } from "@officeorg/core";
import type { ApplyState, PreviewState } from "@/app/admin/import/actions";

type Kind = "people" | "teams";

interface Props {
  kind: Kind;
  title: string;
  description: string;
  preview: (text: string) => Promise<PreviewState>;
  apply: (text: string) => Promise<ApplyState>;
}

// Upload, dry run, then apply. The file text is kept in state so Apply sends exactly what was
// previewed. The server re-plans on apply, so a stale preview can't write anything.
export function CsvImportPanel({ kind, title, description, preview, apply }: Props) {
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [state, setState] = useState<PreviewState | null>(null);
  const [applied, setApplied] = useState<ApplyState | null>(null);
  const [pending, startTransition] = useTransition();

  async function onFile(file: File | undefined) {
    setApplied(null);
    setState(null);
    if (!file) return;
    const body = await file.text();
    setText(body);
    setFileName(file.name);
    startTransition(async () => setState(await preview(body)));
  }

  function onApply() {
    if (!text) return;
    startTransition(async () => {
      const result = await apply(text);
      setApplied(result);
      if (result.ok) {
        setText(null);
        setFileName(null);
        setState(null);
      }
    });
  }

  const plan = state?.ok ? state.plan : null;

  return (
    <section className="rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{description}</p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900">
          <span>Choose CSV file</span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            aria-label={`${kind} CSV file`}
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </label>
        {fileName ? <span className="text-sm text-neutral-600 dark:text-neutral-400">{fileName}</span> : null}
        {pending ? <span className="text-sm text-neutral-500">Working…</span> : null}
      </div>

      {state && !state.ok ? (
        <p role="alert" className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-100">
          {state.error}
        </p>
      ) : null}

      {plan ? <PlanSummary plan={plan} /> : null}

      {plan ? (
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={onApply}
            disabled={!plan.canApply || pending}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900"
          >
            Apply {plan.counts.create + plan.counts.update} change(s)
          </button>
          {!plan.canApply ? (
            <span className="text-sm text-neutral-600 dark:text-neutral-400">
              Fix the errors and upload again. Nothing is applied until every row is valid.
            </span>
          ) : null}
        </div>
      ) : null}

      {applied ? (
        applied.ok ? (
          <p role="status" className="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-900 dark:bg-green-950 dark:text-green-100">
            Imported. {applied.result.created} created, {applied.result.updated} updated,{" "}
            {applied.result.unchanged} unchanged.
          </p>
        ) : (
          <p role="alert" className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-100">
            {applied.error}
          </p>
        )
      ) : null}
    </section>
  );
}

function PlanSummary({ plan }: { plan: ImportPlan<PersonRecord> | ImportPlan<TeamRecord> }) {
  return (
    <div className="mt-4">
      <p className="text-sm">
        {plan.counts.create} to create · {plan.counts.update} to update · {plan.counts.unchanged} unchanged ·{" "}
        <span className={plan.counts.error > 0 ? "font-medium text-red-700 dark:text-red-400" : ""}>
          {plan.counts.error} with errors
        </span>
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 text-xs uppercase text-neutral-500 dark:border-neutral-800">
            <tr>
              <th className="py-2 pr-3 font-medium">Line</th>
              <th className="py-2 pr-3 font-medium">Row</th>
              <th className="py-2 pr-3 font-medium">Action</th>
              <th className="py-2 font-medium">Details</th>
            </tr>
          </thead>
          <tbody>
            {plan.rows.map((row) => (
              <tr key={`${row.line}-${row.key}`} className="border-b border-neutral-100 align-top dark:border-neutral-900">
                <td className="py-2 pr-3 tabular-nums text-neutral-500">{row.line}</td>
                <td className="py-2 pr-3 font-mono text-xs">{row.key}</td>
                <td className="py-2 pr-3">
                  <ActionBadge action={row.action} />
                </td>
                <td className="py-2">
                  {row.action === "error" ? (
                    <span className="text-red-700 dark:text-red-400">{row.message}</span>
                  ) : row.action === "update" ? (
                    <ChangeList changes={row.changes} />
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ActionBadge({ action }: { action: string }) {
  const tone: Record<string, string> = {
    create: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200",
    update: "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200",
    unchanged: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
    error: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
  };
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${tone[action] ?? ""}`}>{action}</span>;
}

function ChangeList({ changes }: { changes: FieldChange[] }) {
  return (
    <ul className="space-y-0.5">
      {changes.map((c) => (
        <li key={c.field}>
          <span className="font-mono text-xs text-neutral-500">{c.field}</span>{" "}
          <span className="text-neutral-500 line-through">{show(c.before)}</span> → <span>{show(c.after)}</span>
        </li>
      ))}
    </ul>
  );
}

function show(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  return String(value);
}
