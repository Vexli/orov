"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { FloorForm, LocationForm } from "@officeorg/core";
import {
  saveFloorAction,
  saveLocationAction,
  type SpaceSaveState,
} from "@/app/admin/locations/actions";

const inputClass = "mt-1 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm";

// The shared shape of the office and floor forms: local values, one save, and errors shown on
// the field the server names.
function useForm<T>(initial: T, save: (values: T) => Promise<SpaceSaveState>, done: string) {
  const router = useRouter();
  const [values, setValues] = useState<T>(initial);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof T>(key: K, value: T[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await save(values);
      if (result.ok) {
        router.push(done);
        router.refresh();
      } else {
        setError({ message: result.error, field: result.field });
      }
    });
  }

  const fieldError = (name: string) =>
    error?.field === name ? <p className="mt-1 text-xs text-destructive">{error.message}</p> : null;
  const formError =
    error && !error.field ? (
      <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
        {error.message}
      </p>
    ) : null;

  return { values, set, submit, pending, fieldError, formError };
}

function Actions({ pending, label }: { pending: boolean; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg disabled:opacity-50"
      >
        {pending ? "Saving…" : label}
      </button>
      <Link href="/admin/locations" className="text-sm underline">
        Cancel
      </Link>
    </div>
  );
}

interface LocationProps {
  id?: string;
  initial: LocationForm;
  // Desk codes start with the slug, so it can't change once the office has floors.
  slugLocked: boolean;
}

export function LocationFormEditor({ id, initial, slugLocked }: LocationProps) {
  const f = useForm(initial, (v) => saveLocationAction(v, id), "/admin/locations");
  return (
    <form onSubmit={f.submit} className="grid max-w-2xl gap-5" noValidate>
      {f.formError}
      <label className="block text-sm font-medium">
        Name
        <input
          className={inputClass}
          value={f.values.name}
          onChange={(e) => f.set("name", e.target.value)}
        />
        {f.fieldError("name")}
      </label>
      <label className="block text-sm font-medium">
        Slug
        <input
          className={inputClass}
          value={f.values.slug}
          readOnly={slugLocked}
          aria-describedby="location-slug-hint"
          onChange={(e) => f.set("slug", e.target.value)}
        />
        <span id="location-slug-hint" className="text-xs font-normal text-muted-fg">
          {slugLocked
            ? "Fixed, because desk codes on this office's floors start with it."
            : "Short and lowercase, such as sf. Desk codes start with it (SF-2-014)."}
        </span>
        {f.fieldError("slug")}
      </label>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Time zone
          <input
            className={inputClass}
            placeholder="America/Los_Angeles"
            value={f.values.timezone}
            onChange={(e) => f.set("timezone", e.target.value)}
          />
          {f.fieldError("timezone")}
        </label>
        <label className="block text-sm font-medium">
          Region
          <input
            className={inputClass}
            placeholder="US-CA"
            maxLength={6}
            value={f.values.region}
            onChange={(e) => f.set("region", e.target.value.toUpperCase())}
          />
          <span className="text-xs font-normal text-muted-fg">
            ISO 3166 country (US) or subdivision (US-CA)
          </span>
          {f.fieldError("region")}
        </label>
      </div>
      <label className="block max-w-40 text-sm font-medium">
        Sort order
        <input
          className={inputClass}
          type="number"
          value={f.values.sortOrder}
          onChange={(e) => f.set("sortOrder", Number(e.target.value))}
        />
        {f.fieldError("sortOrder")}
      </label>
      <Actions pending={f.pending} label={id ? "Save office" : "Create office"} />
    </form>
  );
}

interface FloorProps {
  locationId: string;
  id?: string;
  initial: FloorForm;
  // Desk ids in the drawing carry the floor slug, so it can't change once a drawing exists.
  slugLocked: boolean;
}

export function FloorFormEditor({ locationId, id, initial, slugLocked }: FloorProps) {
  const f = useForm(
    initial,
    (v) => saveFloorAction(locationId, v, id),
    id ? `/admin/floors/${id}` : "/admin/locations",
  );
  return (
    <form onSubmit={f.submit} className="grid max-w-2xl gap-5" noValidate>
      {f.formError}
      <label className="block text-sm font-medium">
        Name
        <input
          className={inputClass}
          value={f.values.name}
          onChange={(e) => f.set("name", e.target.value)}
        />
        {f.fieldError("name")}
      </label>
      <label className="block text-sm font-medium">
        Slug
        <input
          className={inputClass}
          value={f.values.slug}
          readOnly={slugLocked}
          aria-describedby="floor-slug-hint"
          onChange={(e) => f.set("slug", e.target.value)}
        />
        <span id="floor-slug-hint" className="text-xs font-normal text-muted-fg">
          {slugLocked
            ? "Fixed, because the desk ids in the drawing use it."
            : "Usually the floor number. Desk ids in the drawing must use it: desk-<slug>-<n>."}
        </span>
        {f.fieldError("slug")}
      </label>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Level
          <input
            className={inputClass}
            type="number"
            value={f.values.level}
            onChange={(e) => f.set("level", Number(e.target.value))}
          />
          {f.fieldError("level")}
        </label>
        <label className="block text-sm font-medium">
          Sort order
          <input
            className={inputClass}
            type="number"
            value={f.values.sortOrder}
            onChange={(e) => f.set("sortOrder", Number(e.target.value))}
          />
          {f.fieldError("sortOrder")}
        </label>
      </div>
      <Actions pending={f.pending} label={id ? "Save floor" : "Create floor"} />
    </form>
  );
}
