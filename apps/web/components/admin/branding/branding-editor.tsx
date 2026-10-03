"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { blockingErrors, contrastFailures } from "@officeorg/core/theme/build";
import { suggestMapping, type MappingEntry, type SlotMapping } from "@officeorg/core/theme/map";
import type { TokenFile } from "@officeorg/core/theme/parse";
import {
  applyThemeAction,
  previewThemeAction,
  type PreviewResult,
} from "@/app/admin/branding/actions";
import { ContrastReport } from "./contrast-report";
import { FontList, type BrandAsset } from "./asset-uploads";
import { SlotTable } from "./slot-table";
import { ThemePreview } from "./theme-preview";

export interface ThemeDraftState {
  files: TokenFile[];
  mapping: SlotMapping;
  darkMode: boolean;
  fonts: string[];
}

interface Props {
  initial: ThemeDraftState;
  assets: BrandAsset[];
}

type Preview = Extract<PreviewResult, { ok: true }>;

const PREVIEW_DELAY_MS = 250;

// Import a brand's token files, map them onto the slots, check them and preview them, then apply
// (plan.md §9.1, U12). Nothing is saved until Apply; the server rebuilds the theme from the same
// draft when it does.
export function BrandingEditor({ initial, assets: initialAssets }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState<ThemeDraftState>(initial);
  const [assets, setAssets] = useState(initialAssets);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [override, setOverride] = useState(false);
  const [applying, startApply] = useTransition();
  const [fileKey, setFileKey] = useState(0);

  // New files ask for suggestions once their tokens are known, and set the dark-mode switch
  // from them if they're the first files in the draft.
  const suggestNext = useRef<{ setDarkMode: boolean } | null>(null);
  const request = useRef(0);

  useEffect(() => {
    const id = ++request.current;
    const timer = setTimeout(async () => {
      const result = await previewThemeAction(draft);
      // A slower, older preview must not overwrite a newer one.
      if (id !== request.current) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      const suggest = suggestNext.current;
      suggestNext.current = null;
      if (suggest) {
        const mapping = suggestMapping(result.build.tokens, draft.mapping);
        const darkMode = suggest.setDarkMode ? result.build.hasDarkTokens : draft.darkMode;
        if (
          JSON.stringify(mapping) !== JSON.stringify(draft.mapping) ||
          darkMode !== draft.darkMode
        ) {
          setDraft((d) => ({ ...d, mapping, darkMode }));
          return;
        }
      }
      setPreview(result);
    }, PREVIEW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [draft]);

  async function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const added: TokenFile[] = [];
    for (const file of Array.from(list)) {
      try {
        added.push({ name: file.name, content: JSON.parse(await file.text()) });
      } catch {
        setError(`${file.name} isn't valid JSON.`);
        setFileKey((k) => k + 1);
        return;
      }
    }
    suggestNext.current = { setDarkMode: draft.files.length === 0 };
    setDraft((d) => {
      const names = new Set(added.map((f) => f.name));
      // A file with the same name replaces the old one, as when re-exporting from Figma.
      return { ...d, files: [...d.files.filter((f) => !names.has(f.name)), ...added] };
    });
    setFileKey((k) => k + 1);
  }

  function removeFile(name: string) {
    setDraft((d) => ({ ...d, files: d.files.filter((f) => f.name !== name) }));
  }

  function setEntry(slot: string, entry: MappingEntry | null) {
    setDraft((d) => {
      const mapping = { ...d.mapping };
      if (entry) mapping[slot] = entry;
      else delete mapping[slot];
      return { ...d, mapping };
    });
  }

  function apply() {
    startApply(async () => {
      const result = await applyThemeAction(draft, override);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/admin/branding?applied=${result.version}`);
      router.refresh();
    });
  }

  const build = preview?.build;
  const errors = build
    ? [...blockingErrors(build).map((e) => e.message), ...preview.assetProblems]
    : [];
  const warnings = build?.issues.filter((i) => i.severity === "warning") ?? [];
  const failures = build ? contrastFailures(build) : [];
  const canApply = !!build && errors.length === 0 && (failures.length === 0 || override);

  return (
    <div className="space-y-8">
      <section aria-labelledby="files-heading" className="rounded-lg border border-border p-5">
        <h2 id="files-heading" className="font-heading">
          Token files
        </h2>
        <p className="mt-1 text-sm text-muted-fg">
          DTCG or Tokens Studio JSON, exported from Figma, Penpot or Tokens Studio. Add a light and
          a dark file together if your tool exports one per mode. Without a file, type values into
          the slots below.
        </p>
        <input
          key={fileKey}
          type="file"
          multiple
          accept=".json,application/json"
          aria-label="Token files (JSON)"
          onChange={(e) => void addFiles(e.target.files)}
          className="mt-3 block text-sm"
        />
        {build && build.files.length > 0 ? (
          <ul className="mt-4 space-y-2 text-sm" aria-label="Imported token files">
            {build.files.map((file) => (
              <li key={file.name} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{file.name}</span>
                <span className="text-xs text-muted-fg">
                  {file.format === "dtcg" ? "DTCG" : "Tokens Studio"}
                </span>
                {file.sets.map((set) => (
                  <span key={set.name} className="rounded bg-muted px-1.5 py-0.5 text-xs">
                    {set.name}: {set.mode === "base" ? "both modes" : set.mode}, {set.tokens} tokens
                  </span>
                ))}
                <button
                  type="button"
                  onClick={() => removeFile(file.name)}
                  className="ml-auto text-xs underline"
                >
                  Remove {file.name}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <label className="mt-4 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={draft.darkMode}
            onChange={(e) => setDraft((d) => ({ ...d, darkMode: e.target.checked }))}
          />
          <span>
            Follow each viewer&apos;s dark-mode setting.{" "}
            <span className="text-muted-fg">
              {build?.hasDarkTokens
                ? "The files have dark values."
                : "The files have no dark values, so unmapped slots use the default dark colors."}
            </span>
          </span>
        </label>
      </section>

      {error ? (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {errors.length > 0 || warnings.length > 0 ? (
        <section aria-labelledby="issues-heading" className="space-y-3 text-sm">
          <h2 id="issues-heading" className="font-heading">
            Problems
          </h2>
          {errors.length > 0 ? (
            <div role="alert" className="rounded-md bg-destructive/10 p-3 text-destructive">
              <p className="font-medium">Fix these before applying:</p>
              <ul className="mt-1 list-disc pl-5">
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {warnings.length > 0 ? (
            <details className="rounded-md bg-muted p-3">
              <summary className="cursor-pointer">
                {warnings.length} {warnings.length === 1 ? "token was" : "tokens were"} skipped or
                fell back to the default
              </summary>
              <ul className="mt-2 list-disc pl-5">
                {warnings.map((w) => (
                  <li key={w.message}>{w.message}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>
      ) : null}

      <SlotTable
        mapping={draft.mapping}
        build={build ?? null}
        darkMode={draft.darkMode}
        assets={assets}
        onChange={setEntry}
        onUploaded={(asset) => setAssets((a) => [asset, ...a.filter((x) => x.id !== asset.id)])}
      />

      <FontList
        selected={draft.fonts}
        assets={assets}
        onChange={(fonts) => setDraft((d) => ({ ...d, fonts }))}
        onUploaded={(asset) => setAssets((a) => [asset, ...a.filter((x) => x.id !== asset.id)])}
      />

      {build ? (
        <ContrastReport
          checks={build.contrast}
          onUseShade={(slot, mode, hex) => {
            const light = build.values.light[slot]!;
            const dark = build.values.dark?.[slot] ?? light;
            setEntry(slot, mode === "light" ? { light: hex, dark } : { light, dark: hex });
          }}
        />
      ) : null}

      {build ? <ThemePreview css={build.css} values={build.values} /> : null}

      <section aria-labelledby="apply-heading" className="rounded-lg border border-border p-5">
        <h2 id="apply-heading" className="font-heading">
          Apply
        </h2>
        <p className="mt-1 text-sm text-muted-fg">
          Saves the theme as a new version and switches every page to it. Earlier versions stay
          available below.
        </p>
        {failures.length > 0 ? (
          <label className="mt-3 flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={override}
              onChange={(e) => setOverride(e.target.checked)}
            />
            <span>
              Apply anyway. I accept {failures.length} failing contrast{" "}
              {failures.length === 1 ? "check" : "checks"}.
            </span>
          </label>
        ) : null}
        <button
          type="button"
          onClick={apply}
          disabled={!canApply || applying}
          className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg disabled:opacity-50"
        >
          {applying ? "Applying…" : "Apply theme"}
        </button>
      </section>
    </div>
  );
}
