"use client";

import type { ThemeBuild } from "@orov/core/theme/build";
import { canMap, type MappingEntry, type SlotMapping } from "@orov/core/theme/map";
import { SLOTS, type SlotDefinition } from "@orov/core/theme/slots";
import { AssetSlotControl, type BrandAsset } from "./asset-uploads";

// The token → slot mapping editor (plan.md §9.1, step 2). Each slot takes a token of a matching
// type, a typed value, or its default. The resolved values shown come from the server's preview,
// so what the admin sees has passed the same grammar the saved theme will.

const GROUPS: { title: string; match: (name: string) => boolean }[] = [
  {
    title: "Surface and text",
    match: (n) =>
      ["bg", "fg", "muted", "muted-fg", "card", "card-fg", "border", "ring"].includes(n),
  },
  {
    title: "Brand",
    match: (n) => /^(primary|accent|destructive)(-fg)?$/.test(n),
  },
  { title: "Floor map", match: (n) => n.startsWith("map.") || n.startsWith("room.") },
  { title: "Presence", match: (n) => n.startsWith("presence.") },
  { title: "Team colors", match: (n) => n.startsWith("team.palette.") },
  {
    title: "Type, shape and space",
    match: (n) => n.startsWith("font.") || ["radius.base", "spacing.base", "density"].includes(n),
  },
  {
    title: "Name and logos",
    match: (n) => ["appName", "logo.light", "logo.dark", "favicon"].includes(n),
  },
];

interface Props {
  mapping: SlotMapping;
  build: ThemeBuild | null;
  darkMode: boolean;
  assets: BrandAsset[];
  onChange: (slot: string, entry: MappingEntry | null) => void;
  onUploaded: (asset: BrandAsset) => void;
}

export function SlotTable({ mapping, build, darkMode, assets, onChange, onUploaded }: Props) {
  return (
    <section aria-labelledby="slots-heading" className="space-y-6">
      <div>
        <h2 id="slots-heading" className="font-heading">
          Slots
        </h2>
        <p className="mt-1 text-sm text-muted-fg">
          Every part of the app is styled through these slots. A slot left on its default keeps
          OrOv&apos;s value. Suggestions come from token names; change any of them.
        </p>
      </div>
      {GROUPS.map((group) => (
        <table key={group.title} className="w-full text-left text-sm">
          <caption className="pb-2 text-left font-medium">{group.title}</caption>
          <thead className="border-b border-border text-xs uppercase text-muted-fg">
            <tr>
              <th className="w-1/4 py-2 pr-3 font-medium">Slot</th>
              <th className="py-2 pr-3 font-medium">Source</th>
              <th className="w-40 py-2 font-medium">Result</th>
            </tr>
          </thead>
          <tbody>
            {SLOTS.filter((s) => group.match(s.name)).map((slot) => (
              <SlotRow
                key={slot.name}
                slot={slot}
                entry={mapping[slot.name]}
                build={build}
                darkMode={darkMode}
                assets={assets}
                onChange={(entry) => onChange(slot.name, entry)}
                onUploaded={onUploaded}
              />
            ))}
          </tbody>
        </table>
      ))}
    </section>
  );
}

interface RowProps {
  slot: SlotDefinition;
  entry: MappingEntry | undefined;
  build: ThemeBuild | null;
  darkMode: boolean;
  assets: BrandAsset[];
  onChange: (entry: MappingEntry | null) => void;
  onUploaded: (asset: BrandAsset) => void;
}

function SlotRow({ slot, entry, build, darkMode, assets, onChange, onUploaded }: RowProps) {
  const light = build?.values.light[slot.name] ?? slot.light;
  const dark = build?.values.dark?.[slot.name];
  const issues = build?.issues.filter((i) => i.path === slot.name) ?? [];
  const tokens = build?.tokens.filter((t) => canMap(slot, t)) ?? [];
  const mode = !entry ? "" : "token" in entry ? `token:${entry.token}` : "custom";

  function choose(value: string) {
    if (value === "") onChange(null);
    else if (value === "custom")
      onChange(darkMode && dark && dark !== light ? { light, dark } : { light });
    else onChange({ token: value.slice("token:".length) });
  }

  return (
    <tr className="border-b border-border align-top last:border-0">
      <td className="py-2 pr-3">
        <span className="font-mono text-xs">{slot.name}</span>
        <p className="text-xs text-muted-fg">{slot.description}</p>
      </td>
      <td className="py-2 pr-3">
        {slot.kind === "asset" ? (
          <AssetSlotControl
            slot={slot.name}
            value={entry && "light" in entry ? entry.light : ""}
            assets={assets}
            onChange={(id) => onChange(id ? { light: id } : null)}
            onUploaded={onUploaded}
          />
        ) : (
          <div className="space-y-2">
            <select
              aria-label={`Source for ${slot.name}`}
              value={mode}
              onChange={(e) => choose(e.target.value)}
              className="w-full max-w-sm rounded-md border border-border bg-transparent px-2 py-1"
            >
              <option value="">Default</option>
              {tokens.map((t) => (
                <option key={t.path} value={`token:${t.path}`}>
                  {`{${t.path}}`}
                </option>
              ))}
              {/* A mapped token that isn't in the current files stays selectable, so the
                  mapping isn't silently changed. */}
              {entry && "token" in entry && !tokens.some((t) => t.path === entry.token) ? (
                <option value={`token:${entry.token}`}>{`{${entry.token}} (missing)`}</option>
              ) : null}
              <option value="custom">Custom value</option>
            </select>
            {entry && "light" in entry ? (
              <CustomInputs slot={slot} entry={entry} darkMode={darkMode} onChange={onChange} />
            ) : null}
            {issues.map((issue) => (
              <p
                key={issue.message}
                className={`text-xs ${issue.severity === "error" ? "text-destructive" : "text-muted-fg"}`}
              >
                {issue.message}
              </p>
            ))}
          </div>
        )}
      </td>
      <td className="py-2">
        <Result kind={slot.kind} light={light} dark={darkMode ? dark : undefined} />
      </td>
    </tr>
  );
}

function CustomInputs({
  slot,
  entry,
  darkMode,
  onChange,
}: {
  slot: SlotDefinition;
  entry: { light: string; dark?: string };
  darkMode: boolean;
  onChange: (entry: MappingEntry) => void;
}) {
  const input = "w-full max-w-[12rem] rounded-md border border-border bg-transparent px-2 py-1";
  if (slot.kind === "density") {
    return (
      <select
        aria-label={`${slot.name} value`}
        value={entry.light}
        onChange={(e) => onChange({ light: e.target.value })}
        className={input}
      >
        <option value="comfortable">comfortable</option>
        <option value="compact">compact</option>
      </select>
    );
  }
  // Only colors differ by mode in practice; other kinds take one value.
  const twoModes = darkMode && slot.kind === "color";
  return (
    <div className="flex flex-wrap gap-2">
      <input
        aria-label={twoModes ? `${slot.name} light value` : `${slot.name} value`}
        value={entry.light}
        onChange={(e) => onChange({ ...entry, light: e.target.value })}
        className={input}
      />
      {twoModes ? (
        <input
          aria-label={`${slot.name} dark value`}
          placeholder="Same as light"
          value={entry.dark ?? ""}
          onChange={(e) => {
            const dark = e.target.value;
            onChange(dark ? { light: entry.light, dark } : { light: entry.light });
          }}
          className={input}
        />
      ) : null}
    </div>
  );
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {/* The value has passed the color grammar on the server, so it's a plain hex color. */}
      <span
        aria-hidden="true"
        className="inline-block h-4 w-4 rounded border border-border"
        style={{ backgroundColor: color }}
      />
      <span className="font-mono text-xs" aria-label={label}>
        {color}
      </span>
    </span>
  );
}

function Result({
  kind,
  light,
  dark,
}: {
  kind: SlotDefinition["kind"];
  light: string;
  dark?: string;
}) {
  if (kind === "asset") return null;
  if (kind === "color")
    return (
      <div className="flex flex-col gap-1">
        <Swatch color={light} label={`light ${light}`} />
        {dark && dark !== light ? <Swatch color={dark} label={`dark ${dark}`} /> : null}
      </div>
    );
  return <span className="break-all font-mono text-xs">{light}</span>;
}
