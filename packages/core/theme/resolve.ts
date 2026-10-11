import type { ParsedFile, RawToken, ThemeIssue, TokenSet, TokenType } from "./parse";
import type { ThemeMode } from "./values";

// Merges token sets into one token list per mode and resolves aliases such as
// `{color.brand.600}` (plan.md §9.1, step 1).
//
// Modes come from set names: a set whose name has the word "dark" ("Dark", "theme/dark",
// "Mode-Dark") applies only in dark mode, one with "light" only in light mode, and every other
// set is a base applied in both, before the mode's own sets. A token's `$extensions.mode` values
// win over all of that.

export interface ResolvedToken {
  path: string;
  type: TokenType;
  declaredType: string | null;
  // Undefined when the token exists only in the other mode.
  light?: unknown;
  dark?: unknown;
}

export interface ResolvedTokens {
  tokens: ResolvedToken[];
  // The token files give dark-mode values: a dark set, or `$extensions.mode.dark` on a token.
  hasDark: boolean;
  sets: { name: string; mode: ThemeMode | "base" }[];
  issues: ThemeIssue[];
}

export function setMode(name: string): ThemeMode | "base" {
  const words = name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/);
  if (words.includes("dark")) return "dark";
  if (words.includes("light")) return "light";
  return "base";
}

const ALIAS = /^\{([^{}]+)\}$/;
const EMBEDDED_ALIAS = /\{[^{}]+\}/;

interface Entry {
  token: RawToken;
  value: unknown;
}

function flatten(sets: TokenSet[], mode: ThemeMode): Map<string, Entry> {
  const map = new Map<string, Entry>();
  for (const set of sets) {
    for (const token of set.tokens) {
      const value = token.modes?.[mode] !== undefined ? token.modes[mode] : token.value;
      map.set(token.path, { token, value });
    }
  }
  return map;
}

function inferType(value: unknown): TokenType {
  if (typeof value === "number") return "number";
  if (typeof value === "string") return "string";
  return "other";
}

type Resolution =
  | { ok: true; value: unknown; type: TokenType; declaredType: string | null }
  | { ok: false; issue: ThemeIssue };

function resolveIn(map: Map<string, Entry>): Map<string, Resolution> {
  const done = new Map<string, Resolution>();

  const visit = (path: string, stack: string[]): Resolution => {
    const cached = done.get(path);
    if (cached) return cached;
    const entry = map.get(path)!;
    const own = entry.token.type;
    let result: Resolution;

    if (typeof entry.value === "string" && ALIAS.test(entry.value.trim())) {
      const target = ALIAS.exec(entry.value.trim())![1]!.trim();
      if (stack.includes(target)) {
        const loop = [...stack.slice(stack.indexOf(target)), target].join(" → ");
        result = {
          ok: false,
          issue: { severity: "error", path, message: `Circular reference: ${loop}` },
        };
      } else if (!map.has(target)) {
        result = {
          ok: false,
          issue: {
            severity: "error",
            path,
            message: `${path} refers to {${target}}, which doesn't exist`,
          },
        };
      } else {
        const inner = visit(target, [...stack, target]);
        result = inner.ok
          ? {
              ok: true,
              value: inner.value,
              type: own ?? inner.type,
              declaredType: entry.token.declaredType ?? inner.declaredType,
            }
          : inner;
      }
    } else if (typeof entry.value === "string" && EMBEDDED_ALIAS.test(entry.value)) {
      // Tokens Studio math ("{space.1} * 2") or a composite string. Not supported in v1.
      result = {
        ok: false,
        issue: {
          severity: "warning",
          path,
          message: `Skipped ${path}: expressions such as "${entry.value}" aren't supported. Use a plain value or a single {reference}.`,
        },
      };
    } else {
      result = {
        ok: true,
        value: entry.value,
        type: own ?? inferType(entry.value),
        declaredType: entry.token.declaredType,
      };
    }
    done.set(path, result);
    return result;
  };

  for (const path of map.keys()) visit(path, [path]);
  return done;
}

export function resolveTokens(files: ParsedFile[]): ResolvedTokens {
  const allSets = files.flatMap((f) => f.sets);
  const sets = allSets.map((s) => ({ name: s.name, mode: setMode(s.name) }));
  const forMode = (mode: ThemeMode) =>
    allSets.filter((s, i) => sets[i]!.mode === "base" || sets[i]!.mode === mode);

  const hasDark =
    sets.some((s) => s.mode === "dark") ||
    allSets.some((s) => s.tokens.some((t) => t.modes?.dark !== undefined));

  const light = resolveIn(flatten(forMode("light"), "light"));
  const dark = hasDark ? resolveIn(flatten(forMode("dark"), "dark")) : null;

  // The same broken reference usually fails in both modes; report it once.
  const issues: ThemeIssue[] = [];
  const seen = new Set<string>();
  const report = (issue: ThemeIssue) => {
    const key = `${issue.severity}|${issue.message}`;
    if (!seen.has(key)) {
      seen.add(key);
      issues.push(issue);
    }
  };

  const paths = new Set([...light.keys(), ...(dark?.keys() ?? [])]);
  const tokens: ResolvedToken[] = [];
  for (const path of paths) {
    const l = light.get(path);
    const d = dark?.get(path);
    if (l && !l.ok) report(l.issue);
    if (d && !d.ok) report(d.issue);
    const okL = l?.ok ? l : undefined;
    const okD = d?.ok ? d : undefined;
    const base = okL ?? okD;
    if (!base) continue;
    tokens.push({
      path,
      type: base.type,
      declaredType: base.declaredType,
      light: okL?.value,
      dark: okD?.value,
    });
  }
  tokens.sort((a, b) => a.path.localeCompare(b.path));
  return { tokens, hasDark, sets, issues };
}
