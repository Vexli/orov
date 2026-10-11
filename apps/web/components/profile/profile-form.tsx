"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { SelfProfileForm } from "@orov/core";
import { PROFILE_PROVIDERS } from "@orov/core/people/identities";
import { saveProfileAction, type ProfileState } from "@/app/(app)/profile/actions";
import { TimeZoneList } from "@/components/admin/time-zone-list";

const inputClass = "mt-1 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm";

export function ProfileForm({ initial, homeRegion }: { initial: SelfProfileForm; homeRegion: string }) {
  const router = useRouter();
  const [values, setValues] = useState<SelfProfileForm>(initial);
  const [state, setState] = useState<ProfileState | null>(null);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof SelfProfileForm>(key: K, value: SelfProfileForm[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setState(null);
    startTransition(async () => {
      const result = await saveProfileAction(values);
      setState(result);
      if (result.ok) {
        // Show what was stored, such as the phone number in international form.
        setValues(result.saved);
        router.refresh();
      }
    });
  }

  const fieldError = (name: string) =>
    state && !state.ok && state.field === name ? (
      <p className="mt-1 text-xs text-destructive">{state.error}</p>
    ) : null;

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {state?.ok ? (
        <p role="status" className="rounded-md bg-muted p-3 text-sm">
          Profile saved.
        </p>
      ) : null}
      {state && !state.ok && !state.field ? (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <label className="block text-sm font-medium">
        Preferred name
        <input
          className={inputClass}
          value={values.preferredName ?? ""}
          onChange={(e) => set("preferredName", e.target.value || null)}
        />
      </label>
      <div>
        <label className="block text-sm font-medium">
          Phone
          <input
            className={inputClass}
            type="tel"
            aria-describedby="profile-phone-hint"
            value={values.phone ?? ""}
            onChange={(e) => set("phone", e.target.value || null)}
          />
        </label>
        <span id="profile-phone-hint" className="mt-1 block text-xs text-muted-fg">
          Without a country code, it&apos;s read as a number in {homeRegion.slice(0, 2)}.
        </span>
        {fieldError("phone")}
      </div>
      <label className="block text-sm font-medium">
        Home time zone
        <input
          className={inputClass}
          placeholder="America/Toronto"
          list="profile-time-zones"
          value={values.homeTimezone ?? ""}
          onChange={(e) => set("homeTimezone", e.target.value || null)}
        />
        <TimeZoneList id="profile-time-zones" />
        {fieldError("homeTimezone")}
      </label>
      <fieldset>
        <legend className="text-sm font-medium">Other accounts</legend>
        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          {PROFILE_PROVIDERS.map((provider) => (
            <label key={provider.id} className="block text-sm font-medium">
              {provider.label}
              <input
                className={inputClass}
                placeholder={provider.inputHint}
                value={values.identities[provider.id] ?? ""}
                onChange={(e) => set("identities", { ...values.identities, [provider.id]: e.target.value })}
              />
              {fieldError(`identities.${provider.id}`)}
            </label>
          ))}
        </div>
      </fieldset>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
