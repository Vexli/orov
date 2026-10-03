import { z } from "zod";
import { contrastReport, type ContrastCheck } from "./contrast";
import { emitThemeCss, type FontFace } from "./emit-css";
import { applyMapping, mappingSchema, type SlotMapping } from "./map";
import {
  parseTokenFile,
  type ParsedFile,
  type ThemeIssue,
  type TokenFile,
  type TokenFormat,
} from "./parse";
import { resolveTokens, type ResolvedToken } from "./resolve";
import type { ThemeMode, ThemeValues } from "./values";

// The whole import pipeline in one call (plan.md §9.1): parse the files, resolve aliases and
// modes, apply the slot mapping, validate every value, check contrast, and emit CSS. The Branding
// page runs it for every preview, and applying a theme runs it again on the server, so what is
// saved is always rebuilt from the source files rather than trusted from the browser.

export interface ThemeDraft {
  files: TokenFile[];
  mapping: SlotMapping;
  darkMode: boolean;
}

export const MAX_TOKEN_FILES = 10;

export const themeDraftSchema = z.object({
  files: z
    .array(z.object({ name: z.string().min(1).max(200), content: z.unknown() }))
    .max(MAX_TOKEN_FILES),
  mapping: mappingSchema,
  darkMode: z.boolean(),
});

export interface ThemeBuild {
  // The format of the first file, stored on the theme row. "dtcg" when there are no files.
  format: TokenFormat;
  files: {
    name: string;
    format: TokenFormat;
    sets: { name: string; mode: ThemeMode | "base"; tokens: number }[];
  }[];
  tokens: ResolvedToken[];
  // The files carry dark-mode values. The Branding page uses it to suggest the dark-mode switch.
  hasDarkTokens: boolean;
  values: ThemeValues;
  // Parse, reference and mapping problems. Errors block applying the theme.
  issues: ThemeIssue[];
  contrast: ContrastCheck[];
  css: string;
}

export function buildTheme(draft: ThemeDraft, fonts: FontFace[] = []): ThemeBuild {
  const issues: ThemeIssue[] = [];
  const parsed: ParsedFile[] = [];
  for (const file of draft.files) {
    const result = parseTokenFile(file);
    issues.push(...result.issues);
    if (result.parsed) parsed.push(result.parsed);
  }

  const resolved = resolveTokens(parsed);
  issues.push(...resolved.issues);

  const { values, issues: mappingIssues } = applyMapping(resolved.tokens, draft.mapping, {
    darkMode: draft.darkMode,
  });
  issues.push(...mappingIssues);

  let i = 0;
  const files = parsed.map((f) => ({
    name: f.name,
    format: f.format,
    sets: f.sets.map((s) => ({
      name: s.name,
      mode: resolved.sets[i++]!.mode,
      tokens: s.tokens.length,
    })),
  }));

  return {
    format: parsed[0]?.format ?? "dtcg",
    files,
    tokens: resolved.tokens,
    hasDarkTokens: resolved.hasDark,
    values,
    issues,
    contrast: contrastReport(values),
    css: emitThemeCss(values, fonts),
  };
}

export function blockingErrors(build: ThemeBuild): ThemeIssue[] {
  return build.issues.filter((i) => i.severity === "error");
}

export function contrastFailures(build: ThemeBuild): ContrastCheck[] {
  return build.contrast.filter((c) => !c.pass);
}

// Errors always block. Contrast failures block unless the admin explicitly overrides them.
export function canApplyTheme(build: ThemeBuild, overrideContrast: boolean): boolean {
  return (
    blockingErrors(build).length === 0 && (overrideContrast || contrastFailures(build).length === 0)
  );
}
