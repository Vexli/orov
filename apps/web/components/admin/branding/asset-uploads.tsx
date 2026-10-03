"use client";

import { useState, useTransition } from "react";
import type { BrandAssetKind } from "@officeorg/core/theme/assets";
import { uploadBrandAssetAction } from "@/app/admin/branding/actions";

// Logo, favicon and font uploads for the Branding page (plan.md §9.1). Files are stored as soon
// as they're uploaded, but nothing uses one until a theme that refers to it is applied.

export interface BrandAsset {
  id: string;
  kind: BrandAssetKind;
  meta: { fileName?: string; family?: string; weight?: number; style?: string };
}

const SLOT_KIND: Record<string, BrandAssetKind> = {
  "logo.light": "logo_light",
  "logo.dark": "logo_dark",
  favicon: "favicon",
};

const assetUrl = (id: string) => `/api/brand-assets/${id}`;

function useUpload(onUploaded: (asset: BrandAsset) => void) {
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  function upload(form: FormData, after?: (asset: BrandAsset) => void) {
    setError(null);
    start(async () => {
      const result = await uploadBrandAssetAction(form);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const asset = { id: result.id, kind: result.kind, meta: result.meta } as BrandAsset;
      onUploaded(asset);
      after?.(asset);
    });
  }
  return { upload, error, busy };
}

export function AssetSlotControl({
  slot,
  value,
  assets,
  onChange,
  onUploaded,
}: {
  slot: string;
  value: string;
  assets: BrandAsset[];
  onChange: (id: string | null) => void;
  onUploaded: (asset: BrandAsset) => void;
}) {
  const kind = SLOT_KIND[slot]!;
  const { upload, error, busy } = useUpload(onUploaded);
  const [fileKey, setFileKey] = useState(0);
  const choices = assets.filter((a) => a.kind === kind);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={assetUrl(value)}
            alt={`Current ${slot}`}
            className="h-8 w-auto max-w-[10rem] rounded border border-border bg-card p-0.5"
          />
        ) : null}
        <select
          aria-label={`Source for ${slot}`}
          value={value}
          onChange={(e) => onChange(e.target.value || null)}
          className="max-w-xs rounded-md border border-border bg-transparent px-2 py-1"
        >
          <option value="">None</option>
          {choices.map((a) => (
            <option key={a.id} value={a.id}>
              {a.meta.fileName ?? a.id}
            </option>
          ))}
        </select>
      </div>
      <input
        key={fileKey}
        type="file"
        accept=".png,.svg,image/png,image/svg+xml"
        aria-label={`Upload ${slot} (PNG or SVG)`}
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const form = new FormData();
          form.set("kind", kind);
          form.set("file", file);
          upload(form, (asset) => onChange(asset.id));
          setFileKey((k) => k + 1);
        }}
        className="block text-xs"
      />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

// Uploaded WOFF2 fonts, and which of them the theme declares. A font is used where `font.sans` or
// `font.mono` names its family.
export function FontList({
  selected,
  assets,
  onChange,
  onUploaded,
}: {
  selected: string[];
  assets: BrandAsset[];
  onChange: (ids: string[]) => void;
  onUploaded: (asset: BrandAsset) => void;
}) {
  const { upload, error, busy } = useUpload(onUploaded);
  const [formKey, setFormKey] = useState(0);
  const fonts = assets.filter((a) => a.kind === "font");

  return (
    <section aria-labelledby="fonts-heading" className="rounded-lg border border-border p-5">
      <h2 id="fonts-heading" className="font-heading">
        Fonts
      </h2>
      <p className="mt-1 text-sm text-muted-fg">
        Upload each weight and style as a WOFF2 file (2 MB at most), then name its family in{" "}
        <code className="font-mono">font.sans</code> or <code className="font-mono">font.mono</code>
        .
      </p>

      {fonts.length > 0 ? (
        <ul className="mt-3 space-y-1 text-sm" aria-label="Uploaded fonts">
          {fonts.map((f) => (
            <li key={f.id}>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selected.includes(f.id)}
                  onChange={(e) =>
                    onChange(
                      e.target.checked ? [...selected, f.id] : selected.filter((id) => id !== f.id),
                    )
                  }
                />
                <span>
                  {f.meta.family} {f.meta.weight} {f.meta.style}
                </span>
                <span className="text-xs text-muted-fg">{f.meta.fileName}</span>
              </label>
            </li>
          ))}
        </ul>
      ) : null}

      <form
        key={formKey}
        className="mt-4 flex flex-wrap items-end gap-3 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          form.set("kind", "font");
          upload(form, (asset) => {
            if (!selected.includes(asset.id)) onChange([...selected, asset.id]);
            setFormKey((k) => k + 1);
          });
        }}
      >
        <label className="flex flex-col gap-1">
          Family
          <input
            name="family"
            required
            className="rounded-md border border-border bg-transparent px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1">
          Weight
          <input
            name="weight"
            type="number"
            min={1}
            max={1000}
            defaultValue={400}
            required
            className="w-24 rounded-md border border-border bg-transparent px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1">
          Style
          <select name="style" className="rounded-md border border-border bg-transparent px-2 py-1">
            <option value="normal">normal</option>
            <option value="italic">italic</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Font file (WOFF2)
          <input name="file" type="file" accept=".woff2,font/woff2" required className="text-xs" />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md border border-border px-3 py-1.5 font-medium hover:bg-muted disabled:opacity-50"
        >
          {busy ? "Uploading…" : "Upload font"}
        </button>
      </form>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
