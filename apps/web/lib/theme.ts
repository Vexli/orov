import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { connection } from "next/server";
import { cache } from "react";
import { blockingErrors, buildTheme, contrastFailures } from "@orov/core/theme/build";
import { emitThemeCss } from "@orov/core/theme/emit-css";
import type { SlotMapping } from "@orov/core/theme/map";
import { SLOTS } from "@orov/core/theme/slots";
import { defaultThemeValues, type ThemeValues } from "@orov/core/theme/values";
import { getDb } from "@orov/db/client";
import { getActiveTheme } from "@orov/db/queries/theme";

// The theme every page is drawn with (plan.md §9.1): the active `theme` row, or, when none has
// been applied, the deploy-time default. That default is the token file named by
// THEME_TOKENS_PATH, or OrOv's own defaults (the same values as theme/default.tokens.json).

export interface CurrentTheme {
  css: string;
  sha256: string;
  values: ThemeValues;
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

let deployDefault: CurrentTheme | null = null;

// A deploy-time token file is mapped by name only: a token whose path is a slot name sets that
// slot, which is the shape the Branding page exports. It's read once per process. A file that
// can't be used is logged and the built-in defaults are served, so a bad path can't take the
// app down.
function loadDeployDefault(): CurrentTheme {
  let values = defaultThemeValues();
  const path = process.env.THEME_TOKENS_PATH;
  if (path) {
    try {
      const files = [{ name: basename(path), content: JSON.parse(readFileSync(path, "utf8")) }];
      const probe = buildTheme({ files, mapping: {}, darkMode: true });
      const paths = new Set(probe.tokens.map((t) => t.path));
      const mapping: SlotMapping = {};
      for (const slot of SLOTS)
        if (slot.kind !== "asset" && paths.has(slot.name))
          mapping[slot.name] = { token: slot.name };
      const build = buildTheme({ files, mapping, darkMode: probe.hasDarkTokens });
      const errors = blockingErrors(build);
      if (errors.length > 0) {
        console.error(
          `THEME_TOKENS_PATH ${path} has errors, so the built-in theme is used: ${errors.map((e) => e.message).join("; ")}`,
        );
      } else {
        values = build.values;
        const failures = contrastFailures(build).length;
        if (failures > 0)
          console.warn(`THEME_TOKENS_PATH ${path}: ${failures} contrast check(s) fail`);
      }
    } catch (error) {
      console.error(
        `THEME_TOKENS_PATH ${path} can't be read, so the built-in theme is used:`,
        error,
      );
    }
  }
  const css = emitThemeCss(values, [], "/* OrOv default theme. */");
  return { css, sha256: sha256(css), values };
}

export const getCurrentTheme = cache(async (): Promise<CurrentTheme> => {
  const row = await getActiveTheme(getDb());
  if (row) return { css: row.compiledCss, sha256: row.sha256, values: row.values };
  deployDefault ??= loadDeployDefault();
  return deployDefault;
});

export interface Brand {
  appName: string;
  // brand_asset ids, or null.
  logoLight: string | null;
  logoDark: string | null;
  favicon: string | null;
  // False for a light-only theme, whose pages never switch to dark.
  darkMode: boolean;
  // Changes with the theme, so the stylesheet can be cached for good under each URL.
  cssHref: string;
}

export const getBrand = cache(async (): Promise<Brand> => {
  // The theme lives in the database, so no page that shows it can be prerendered at build time.
  await connection();
  const theme = await getCurrentTheme();
  const v = theme.values.light;
  return {
    appName: v["appName"] || "OrOv",
    logoLight: v["logo.light"] || null,
    logoDark: v["logo.dark"] || null,
    favicon: v["favicon"] || null,
    darkMode: theme.values.dark !== null,
    cssHref: `/theme.css?v=${theme.sha256.slice(0, 16)}`,
  };
});

export const brandAssetUrl = (id: string) => `/api/brand-assets/${id}`;
