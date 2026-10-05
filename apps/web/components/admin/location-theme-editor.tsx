"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  LOCATION_THEME_SLOTS,
  locationThemeReport,
  type LocationTheme,
  type LocationThemeSlot,
} from "@orov/core/theme/location-override";
import { getSlot } from "@orov/core/theme/slots";
import type { ThemeMode, ThemeValues } from "@orov/core/theme/values";
import { saveLocationMapThemeAction } from "@/app/admin/locations/actions";
import { ContrastReport } from "./branding/contrast-report";

interface Props {
  id: string;
  initial: LocationTheme | null;
  // The active organization theme, which every slot left unset keeps.
  theme: ThemeValues;
}

const EMPTY: LocationTheme = { light: {}, dark: {} };

// An office's own map colors (Phase 6). Each map slot can take its own value per mode; a slot
// left unticked keeps the organization's theme. The contrast report updates as colors change,
// and the server checks it again on save.
export function LocationThemeEditor({ id, initial, theme }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<LocationTheme>(initial ?? EMPTY);
  const [overrideContrast, setOverrideContrast] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const modes: ThemeMode[] = theme.dark ? ["light", "dark"] : ["light"];

  const report = useMemo(() => {
    try {
      return locationThemeReport(theme, values);
    } catch {
      return [];
    }
  }, [theme, values]);
  const failures = report.filter((c) => !c.pass).length;
  const isSet = Object.keys(values.light).length + Object.keys(values.dark).length > 0;

  function set(mode: ThemeMode, slot: LocationThemeSlot, value: string | null) {
    setMessage(null);
    setValues((v) => {
      const next = { ...v[mode] };
      if (value === null) delete next[slot];
      else next[slot] = value;
      return { ...v, [mode]: next };
    });
  }

  function save(input: LocationTheme | null) {
    setMessage(null);
    startTransition(async () => {
      const result = await saveLocationMapThemeAction(id, input, overrideContrast);
      if (result.ok) {
        if (input === null) setValues(EMPTY);
        setOverrideContrast(false);
        setMessage({
          ok: true,
          text: input
            ? "Map colors saved."
            : "This office uses the organization's map colors again.",
        });
        router.refresh();
      } else {
        setMessage({ ok: false, text: result.error });
      }
    });
  }

  return (
    <div className="space-y-4">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Map colors for this office</caption>
        <thead className="border-b border-border text-xs uppercase text-muted-fg">
          <tr>
            <th className="py-2 pr-3 font-medium">Slot</th>
            {modes.map((mode) => (
              <th key={mode} className="py-2 pr-3 font-medium">
                {mode === "light" ? "Light" : "Dark"}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {LOCATION_THEME_SLOTS.map((name) => {
            const slot = getSlot(name);
            return (
              <tr key={name} className="border-b border-border last:border-0">
                <th scope="row" className="py-2 pr-3 font-normal">
                  <span className="block">{slot.description}</span>
                  <span className="block font-mono text-xs text-muted-fg">{name}</span>
                </th>
                {modes.map((mode) => {
                  const own = values[mode][name];
                  // What the office shows when this cell isn't set: dark falls back to the
                  // office's light value, then to the theme.
                  const inherited =
                    (mode === "dark" ? values.light[name] : undefined) ?? theme[mode]![name] ?? "";
                  const label = `${slot.description} (${mode})`;
                  return (
                    <td key={mode} className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          aria-label={`Set ${label}`}
                          checked={own !== undefined}
                          onChange={(e) => set(mode, name, e.target.checked ? inherited : null)}
                        />
                        {slot.kind === "color" ? (
                          <input
                            type="color"
                            aria-label={label}
                            disabled={own === undefined}
                            value={
                              /^#[0-9a-f]{6}$/i.test(own ?? inherited)
                                ? (own ?? inherited)
                                : "#000000"
                            }
                            onChange={(e) => set(mode, name, e.target.value)}
                            className="h-8 w-12 cursor-pointer rounded border border-border bg-transparent disabled:cursor-default disabled:opacity-50"
                          />
                        ) : (
                          <input
                            type="number"
                            aria-label={label}
                            disabled={own === undefined}
                            min={0}
                            max={1}
                            step={0.05}
                            value={own ?? inherited}
                            onChange={(e) => set(mode, name, e.target.value)}
                            className="w-20 rounded-md border border-border bg-transparent px-2 py-1 disabled:opacity-50"
                          />
                        )}
                        <span className="font-mono text-xs text-muted-fg">
                          {own ?? `${inherited} (theme)`}
                        </span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>

      {isSet ? (
        <ContrastReport
          checks={report}
          onUseShade={(slot, mode, hex) => set(mode, slot as LocationThemeSlot, hex)}
        />
      ) : null}

      {message ? (
        <p
          role={message.ok ? "status" : "alert"}
          className={`rounded-md p-3 text-sm ${message.ok ? "bg-muted" : "bg-destructive/10 text-destructive"}`}
        >
          {message.text}
        </p>
      ) : null}

      {isSet && failures > 0 ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={overrideContrast}
            onChange={(e) => setOverrideContrast(e.target.checked)}
          />
          Save even though {failures} {failures === 1 ? "check fails" : "checks fail"}
        </label>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending || !isSet || (failures > 0 && !overrideContrast)}
          onClick={() => save(values)}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg disabled:opacity-50"
        >
          Save map colors
        </button>
        {initial ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => save(null)}
            className="rounded-md border border-border px-4 py-2 text-sm disabled:opacity-50"
          >
            Use the organization&apos;s colors
          </button>
        ) : null}
      </div>
    </div>
  );
}
