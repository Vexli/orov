"use client";

import { useState, useTransition } from "react";
import type { FieldChange, ImportPlan, PersonRecord, TeamRecord } from "@officeorg/core";
import {
  CSV_ENCODING_LABELS,
  CSV_ENCODINGS,
  decodeCsv,
  type CsvEncoding,
  type DecodedCsv,
} from "@officeorg/core/csv/decode";
import type { ApplyState, PreviewState } from "@/app/admin/import/actions";

type Kind = "people" | "teams";

interface Props {
  kind: Kind;
  title: string;
  description: string;
  preview: (text: string) => Promise<PreviewState>;
  apply: (text: string) => Promise<ApplyState>;
}

// Upload, dry run, then apply. The file is decoded here, in whatever encoding it was saved in,
// and the text is kept in state so Apply sends exactly what was previewed. The server re-plans
// on apply, so a stale preview can't write anything.
export function CsvImportPanel({ kind, title, description, preview, apply }: Props) {
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [decoded, setDecoded] = useState<DecodedCsv | null>(null);
  const text = decoded?.text ?? null;
  const [fileName, setFileName] = useState<string | null>(null);
  const [state, setState] = useState<PreviewState | null>(null);
  const [applied, setApplied] = useState<ApplyState | null>(null);
  const [pending, startTransition] = useTransition();

  async function onFile(file: File | undefined) {
    setApplied(null);
    setState(null);
    if (!file) return;
    const fileBytes = new Uint8Array(await file.arrayBuffer());
    setBytes(fileBytes);
    setFileName(file.name);
    readAs(fileBytes);
  }

  // Decodes (detecting the encoding unless one is given) and previews the result.
  function readAs(fileBytes: Uint8Array, encoding?: CsvEncoding) {
    const result = decodeCsv(fileBytes, encoding);
    setDecoded(result);
    setApplied(null);
    startTransition(async () => setState(await preview(result.text)));
  }

  function onApply() {
    if (!text) return;
    startTransition(async () => {
      const result = await apply(text);
      setApplied(result);
      if (result.ok) {
        setBytes(null);
        setDecoded(null);
        setFileName(null);
        setState(null);
      }
    });
  }

  const plan = state?.ok ? state.plan : null;

  return (
    <section className="rounded-lg border border-border p-5">
      <h2 className="text-lg font-heading">{title}</h2>
      <p className="mt-1 text-sm text-muted-fg">{description}</p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted">
          <span>Choose CSV file</span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            aria-label={`${kind} CSV file`}
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </label>
        {fileName ? <span className="text-sm text-muted-fg">{fileName}</span> : null}
        {pending ? <span className="text-sm text-muted-fg">Working…</span> : null}
      </div>

      {bytes && decoded ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <span role="status" aria-label={`${kind} file encoding`}>
            Read as {CSV_ENCODING_LABELS[decoded.encoding]}.
            {decoded.guessed ? " The file didn't say which encoding it uses, so check the names below." : ""}
          </span>
          <label className="flex items-center gap-2">
            Read as
            <select
              value={decoded.encoding}
              onChange={(e) => readAs(bytes, e.target.value as CsvEncoding)}
              className="rounded-md border border-border bg-transparent px-2 py-1 text-sm"
            >
              {CSV_ENCODINGS.map((e) => (
                <option key={e} value={e}>
                  {CSV_ENCODING_LABELS[e]}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      {state && !state.ok ? (
        <p role="alert" className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
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
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg disabled:opacity-40"
          >
            Apply {plan.counts.create + plan.counts.update} change(s)
          </button>
          {!plan.canApply ? (
            <span className="text-sm text-muted-fg">
              Fix the errors and upload again. Nothing is applied until every row is valid.
            </span>
          ) : null}
        </div>
      ) : null}

      {applied ? (
        applied.ok ? (
          <p role="status" className="mt-4 rounded-md bg-muted p-3 text-sm text-fg">
            Imported. {applied.result.created} created, {applied.result.updated} updated,{" "}
            {applied.result.unchanged} unchanged.
          </p>
        ) : (
          <p role="alert" className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
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
        <span className={plan.counts.error > 0 ? "font-medium text-destructive" : ""}>
          {plan.counts.error} with errors
        </span>
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted-fg">
            <tr>
              <th className="py-2 pr-3 font-medium">Line</th>
              <th className="py-2 pr-3 font-medium">Row</th>
              <th className="py-2 pr-3 font-medium">Action</th>
              <th className="py-2 font-medium">Details</th>
            </tr>
          </thead>
          <tbody>
            {plan.rows.map((row) => (
              <tr key={`${row.line}-${row.key}`} className="border-b border-border align-top">
                <td className="py-2 pr-3 tabular-nums text-muted-fg">{row.line}</td>
                <td className="py-2 pr-3 font-mono text-xs">{row.key}</td>
                <td className="py-2 pr-3">
                  <ActionBadge action={row.action} />
                </td>
                <td className="py-2">
                  {row.action === "error" ? (
                    <span className="text-destructive">{row.message}</span>
                  ) : row.action === "update" || row.action === "create" ? (
                    // For a new row these are its filled-in fields, so names can be checked
                    // (for example after a guessed encoding) before applying.
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
    create: "bg-primary text-primary-fg",
    update: "bg-accent text-accent-fg",
    unchanged: "bg-muted text-fg",
    error: "bg-destructive/10 text-destructive",
  };
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${tone[action] ?? ""}`}>{action}</span>;
}

function ChangeList({ changes }: { changes: FieldChange[] }) {
  return (
    <ul className="space-y-0.5">
      {changes.map((c) => (
        <li key={c.field}>
          <span className="font-mono text-xs text-muted-fg">{c.field}</span>{" "}
          <span className="text-muted-fg line-through">{show(c.before)}</span> → <span>{show(c.after)}</span>
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
