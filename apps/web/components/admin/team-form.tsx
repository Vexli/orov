"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { TeamForm } from "@officeorg/core";
import { deleteTeamAction, saveTeamAction, type TeamSaveState } from "@/app/admin/teams/actions";

interface Props {
  id?: string;
  initial: TeamForm;
  // Teams that may be chosen as this team's parent. The caller removes this team and its subtree.
  parents: { id: string; name: string }[];
  leads: { id: string; name: string }[];
}

const inputClass =
  "mt-1 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700";

export function TeamFormEditor({ id, initial, parents, leads }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<TeamForm>(initial);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof TeamForm>(key: K, value: TeamForm[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result: TeamSaveState = await saveTeamAction(values, id);
      if (result.ok) {
        router.push("/admin/teams");
        router.refresh();
      } else {
        setError({ message: result.error, field: result.field });
      }
    });
  }

  function remove() {
    if (!id || !window.confirm(`Delete ${values.name}? This can't be undone.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteTeamAction(id);
      if (result.ok) {
        router.push("/admin/teams");
        router.refresh();
      } else {
        setError({ message: result.error });
      }
    });
  }

  const fieldError = (name: string) =>
    error?.field === name ? <p className="mt-1 text-xs text-red-700 dark:text-red-400">{error.message}</p> : null;

  return (
    <form onSubmit={submit} className="grid max-w-2xl gap-5" noValidate>
      {error && !error.field ? (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-100">
          {error.message}
        </p>
      ) : null}

      <label className="block text-sm font-medium">
        Name
        <input className={inputClass} value={values.name} onChange={(e) => set("name", e.target.value)} />
        {fieldError("name")}
      </label>
      <label className="block text-sm font-medium">
        Slug
        <input className={inputClass} value={values.slug} onChange={(e) => set("slug", e.target.value)} />
        <span className="text-xs text-neutral-500">Used in CSV imports. Lowercase letters, digits and hyphens.</span>
        {fieldError("slug")}
      </label>
      <label className="block text-sm font-medium">
        Parent team
        <select className={inputClass} value={values.parentTeamId ?? ""} onChange={(e) => set("parentTeamId", e.target.value || null)}>
          <option value="">None (top level)</option>
          {parents.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {fieldError("parentTeamId")}
      </label>
      <label className="block text-sm font-medium">
        Lead
        <select className={inputClass} value={values.leadId ?? ""} onChange={(e) => set("leadId", e.target.value || null)}>
          <option value="">No lead</option>
          {leads.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {fieldError("leadId")}
      </label>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Slack channel ID
          <input className={inputClass} placeholder="C0123ABCD" value={values.slackChannelId ?? ""} onChange={(e) => set("slackChannelId", e.target.value || null)} />
        </label>
        <label className="block text-sm font-medium">
          Colour
          <input className={inputClass} placeholder="#0ea5e9" value={values.color ?? ""} onChange={(e) => set("color", e.target.value || null)} />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {pending ? "Saving…" : id ? "Save team" : "Create team"}
        </button>
        <Link href="/admin/teams" className="text-sm underline">
          Cancel
        </Link>
        {id ? (
          <button type="button" onClick={remove} disabled={pending} className="ml-auto text-sm text-red-700 underline disabled:opacity-50 dark:text-red-400">
            Delete team
          </button>
        ) : null}
      </div>
    </form>
  );
}
