"use client";

import { useEffect, useId, useState } from "react";
// Type only: the module itself holds the ISO 3166-2 list and stays on the server (§7.1).
import type { RegionOption } from "@orov/core/regions/iso3166";

const inputClass = "mt-1 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm";

interface Props {
  label: string;
  value: string;
  onChange: (code: string) => void;
  error?: React.ReactNode;
}

// An ISO 3166 code field that suggests regions by name or code as the admin types (Phase 6).
// A typed code still works as before; the server validates whatever is submitted. The full
// name of the current code shows under the field, so "CA-ON" can be checked at a glance.
export function RegionPicker({ label, value, onChange, error }: Props) {
  const id = useId();
  const [text, setText] = useState(value);
  const [options, setOptions] = useState<RegionOption[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // The full name of `value`, once the server has confirmed it's a known code.
  const [known, setKnown] = useState<RegionOption | null>(null);

  // Debounced; a newer query cancels the request for an older one. The same request names the
  // current code, so the field needs no second lookup.
  useEffect(() => {
    const q = text.trim();
    if (!q) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/regions?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const results = (await res.json()) as RegionOption[];
        setOptions(results);
        setActive(0);
        setKnown(results.find((r) => r.code === q.toUpperCase()) ?? null);
      } catch {
        // Aborted, or offline: the field still takes a typed code.
      }
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [text]);

  function type(next: string) {
    setText(next);
    onChange(next.trim().toUpperCase());
    setOpen(next.trim() !== "");
    if (!next.trim()) {
      setOptions([]);
      setKnown(null);
    }
  }

  function pick(option: RegionOption) {
    setText(option.code);
    onChange(option.code);
    setKnown(option);
    setOpen(false);
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    const shown = open && options.length > 0;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!shown) setOpen(options.length > 0);
      else setActive((i) => (i + 1) % options.length);
    } else if (e.key === "ArrowUp" && shown) {
      e.preventDefault();
      setActive((i) => (i - 1 + options.length) % options.length);
    } else if (e.key === "Enter" && shown && options[active]) {
      e.preventDefault();
      pick(options[active]);
    } else if (e.key === "Escape" && shown) {
      e.preventDefault();
      setOpen(false);
    }
  }

  const shown = open && options.length > 0;
  const listId = `${id}-list`;
  const hintId = `${id}-hint`;
  const typedCode = text.trim().toUpperCase();

  return (
    <div className="relative">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        type="text"
        role="combobox"
        autoComplete="off"
        spellCheck={false}
        placeholder="California or US-CA"
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls={listId}
        aria-activedescendant={shown ? `${id}-${options[active]?.code}` : undefined}
        aria-describedby={hintId}
        className={inputClass}
        value={text}
        onChange={(e) => type(e.target.value)}
        onKeyDown={onKey}
        onFocus={() => setOpen(text.trim() !== "" && typedCode !== known?.code)}
        onBlur={() => setOpen(false)}
      />
      <ul
        id={listId}
        role="listbox"
        aria-label="Suggestions"
        hidden={!shown}
        className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-border bg-card p-1 text-card-fg shadow-md"
      >
        {options.map((o, i) => (
          <li
            key={o.code}
            id={`${id}-${o.code}`}
            role="option"
            aria-selected={i === active}
            // Before the input's blur, which would close the list first.
            onMouseDown={(e) => {
              e.preventDefault();
              pick(o);
            }}
            onMouseMove={() => setActive(i)}
            className={`flex cursor-pointer justify-between gap-3 rounded px-2 py-1.5 text-sm ${
              i === active ? "bg-accent text-accent-fg" : ""
            }`}
          >
            <span>{o.label}</span>
            <span className="font-mono text-xs opacity-70">{o.code}</span>
          </li>
        ))}
      </ul>
      <span id={hintId} className="mt-1 block text-xs font-normal text-muted-fg">
        {known && known.code === typedCode
          ? known.label
          : "Type a country or region name, or an ISO 3166 code (US, US-CA)"}
      </span>
      {error}
    </div>
  );
}
