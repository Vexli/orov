"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const MIN = 12;
const input = "mt-1 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm";
const button = "rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg disabled:opacity-50";

interface SectionPlan {
  create: number;
  update: number;
  unchanged: number;
  conflicts: string[];
}
interface Plan {
  sections: Record<string, SectionPlan>;
  removed: Record<string, number>;
  canApply: boolean;
}

// A rough strength hint: length matters most for a passphrase.
function strength(passphrase: string): string {
  const n = [...passphrase].length;
  if (n === 0) return "";
  if (n < MIN) return `Too short: at least ${MIN} characters.`;
  if (n < 20) return "Fine. Several unrelated words are stronger still.";
  return "Strong.";
}

export function BackupPanel() {
  return (
    <div className="space-y-8 pt-4">
      <ExportSection />
      <ImportSection />
    </div>
  );
}

function ExportSection() {
  const [passphrase, setPassphrase] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const ready = [...passphrase].length >= MIN && passphrase === again;

  function download(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/admin/backup/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase }),
      });
      if (!response.ok) {
        setError(((await response.json().catch(() => ({}))) as { error?: string }).error ?? "The export failed.");
        return;
      }
      const name = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? "export.json";
      const url = URL.createObjectURL(await response.blob());
      const link = Object.assign(document.createElement("a"), { href: url, download: name });
      link.click();
      URL.revokeObjectURL(url);
      setDone(true);
    });
  }

  return (
    <section aria-labelledby="export-heading" className="rounded-lg border border-border p-5">
      <h2 id="export-heading" className="font-heading">
        Export
      </h2>
      <form onSubmit={download} className="mt-3 grid gap-4 sm:grid-cols-2" noValidate>
        <label className="block text-sm font-medium">
          Passphrase
          <input className={input} type="password" autoComplete="new-password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
          <span className="mt-1 block text-xs font-normal text-muted-fg">{strength(passphrase)}</span>
        </label>
        <label className="block text-sm font-medium">
          The passphrase again
          <input className={input} type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
          {again && again !== passphrase ? (
            <span className="mt-1 block text-xs font-normal text-destructive">The two don&apos;t match.</span>
          ) : null}
        </label>
        <p className="text-xs text-muted-fg sm:col-span-2">
          Keep the passphrase somewhere safe. Without it the file can&apos;t be opened, by anyone.
        </p>
        {error ? (
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive sm:col-span-2">
            {error}
          </p>
        ) : null}
        {done ? (
          <p role="status" className="rounded-md bg-muted p-3 text-sm sm:col-span-2">
            Exported. The download is recorded in the audit log.
          </p>
        ) : null}
        <div className="sm:col-span-2">
          <button type="submit" className={button} disabled={!ready || pending}>
            {pending ? "Exporting…" : "Download encrypted file"}
          </button>
        </div>
      </form>
    </section>
  );
}

function ImportSection() {
  const router = useRouter();
  const [file, setFile] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [applyRoles, setApplyRoles] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function send(apply: boolean) {
    if (!file) return;
    setMessage(null);
    startTransition(async () => {
      const response = await fetch("/api/admin/backup/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file, passphrase, mode, applyRoles, apply }),
      });
      const body = (await response.json().catch(() => ({}))) as { plan?: Plan; error?: string };
      if (!response.ok || !body.plan) {
        setMessage({ tone: "error", text: body.error ?? "The file couldn't be read." });
        if (apply) setPlan(null);
        return;
      }
      if (apply) {
        setPlan(null);
        setMessage({ tone: "info", text: "Imported. The import is recorded in the audit log." });
        router.refresh();
      } else {
        setPlan(body.plan);
      }
    });
  }

  return (
    <section aria-labelledby="import-heading" className="rounded-lg border border-border p-5">
      <h2 id="import-heading" className="font-heading">
        Import
      </h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Export file
          <input
            type="file"
            accept=".json,application/json"
            className="mt-1 block text-sm"
            onChange={async (e) => {
              setPlan(null);
              setFile((await e.target.files?.[0]?.text()) ?? null);
            }}
          />
        </label>
        <label className="block text-sm font-medium">
          Its passphrase
          <input className={input} type="password" autoComplete="off" value={passphrase} onChange={(e) => { setPassphrase(e.target.value); setPlan(null); }} />
        </label>
        <fieldset className="sm:col-span-2">
          <legend className="text-sm font-medium">How to load it</legend>
          <label className="mt-2 flex items-start gap-2 text-sm">
            <input type="radio" name="mode" className="mt-1" checked={mode === "merge"} onChange={() => { setMode("merge"); setPlan(null); }} />
            <span>Merge: add and update by id, and keep everything else here.</span>
          </label>
          <label className="mt-1 flex items-start gap-2 text-sm">
            <input type="radio" name="mode" className="mt-1" checked={mode === "replace"} onChange={() => { setMode("replace"); setPlan(null); }} />
            <span>Replace: remove this instance&apos;s organization data and load the file instead. For restoring a backup or a new instance.</span>
          </label>
        </fieldset>
        <label className="flex items-start gap-2 text-sm sm:col-span-2">
          <input type="checkbox" className="mt-1" checked={applyRoles} onChange={(e) => setApplyRoles(e.target.checked)} />
          <span>Take admin and viewer roles from the file. Otherwise new users are viewers and existing ones keep their role. You stay an admin either way.</span>
        </label>
      </div>
      <div className="mt-4">
        <button type="button" className={button} disabled={!file || !passphrase || pending} onClick={() => send(false)}>
          {pending && !plan ? "Reading…" : "Preview"}
        </button>
      </div>
      {message ? (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={`mt-4 rounded-md p-3 text-sm ${message.tone === "error" ? "bg-destructive/10 text-destructive" : "bg-muted"}`}
        >
          {message.text}
        </p>
      ) : null}
      {plan ? (
        <div className="mt-4">
          <table className="w-full text-left text-sm" aria-label="What the import would change">
            <thead className="border-b border-border text-xs uppercase text-muted-fg">
              <tr>
                <th className="py-2 pr-3 font-medium">Section</th>
                <th className="py-2 pr-3 text-right font-medium">New</th>
                <th className="py-2 pr-3 text-right font-medium">Updated</th>
                <th className="py-2 pr-3 text-right font-medium">Unchanged</th>
                {mode === "replace" ? <th className="py-2 pr-3 text-right font-medium">Removed</th> : null}
                <th className="py-2 font-medium">Conflicts</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(plan.sections).map(([name, s]) => (
                <tr key={name} className="border-b border-border align-top">
                  <td className="py-2 pr-3">{name}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{s.create}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{s.update}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{s.unchanged}</td>
                  {mode === "replace" ? <td className="py-2 pr-3 text-right tabular-nums">{plan.removed[name]}</td> : null}
                  <td className="py-2 text-destructive">{s.conflicts.join("; ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className={`${button} mt-4`} disabled={!plan.canApply || pending} onClick={() => send(true)}>
            {pending ? "Importing…" : mode === "replace" ? "Replace and import" : "Merge and import"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
