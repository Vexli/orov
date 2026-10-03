import { BrandingEditor, type ThemeDraftState } from "@/components/admin/branding/branding-editor";
import { ThemeVersions } from "@/components/admin/branding/theme-versions";
import { getDb } from "@officeorg/db/client";
import {
  getActiveTheme,
  getTheme,
  listBrandAssets,
  listThemeVersions,
} from "@officeorg/db/queries/theme";

const EMPTY: ThemeDraftState = { files: [], mapping: {}, darkMode: true, fonts: [] };

export default async function BrandingAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ applied?: string; activated?: string }>;
}) {
  const { applied, activated } = await searchParams;
  const db = getDb();
  const [active, versions, assets] = await Promise.all([
    getActiveTheme(db),
    listThemeVersions(db),
    listBrandAssets(db),
  ]);
  // The draft starts from the theme in use, so editing it and applying again keeps everything
  // the admin doesn't touch.
  const current = active ? await getTheme(db, active.id) : null;
  const initial: ThemeDraftState = current
    ? {
        files: current.sourceTokens.files,
        mapping: current.mapping.slots,
        darkMode: current.mapping.darkMode,
        fonts: current.mapping.fonts,
      }
    : EMPTY;

  const notice = applied
    ? `Applied as version ${Number(applied)}.`
    : activated
      ? `Now using ${activated === "default" ? "the default theme" : activated.slice(0, 20)}.`
      : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-heading">Branding</h1>
        <p className="mt-1 text-sm text-muted-fg">
          Import the brand&apos;s design tokens, map them onto the app&apos;s slots, check contrast
          and preview the result before applying it. The guide for designers is{" "}
          <code className="font-mono">docs/theming.md</code>.
        </p>
      </div>
      {notice ? (
        <p role="status" className="rounded-md bg-muted p-3 text-sm">
          {notice}
        </p>
      ) : null}
      <BrandingEditor
        key={active?.id ?? "default"}
        initial={initial}
        assets={assets.map((a) => ({ id: a.id, kind: a.kind, meta: a.meta }))}
      />
      <ThemeVersions versions={versions} />
    </div>
  );
}
