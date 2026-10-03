// Reads design token files into flat token lists (plan.md §9.1, step 1). Two formats are
// accepted, which between them cover Figma, Penpot and Tokens Studio:
//
// - W3C DTCG: tokens are objects with `$value`; `$type` is inherited from the nearest group.
//   One file is one token set, named after the file ("Light.tokens.json" → "Light"), which is
//   how Figma's Variables export writes one file per mode.
// - Tokens Studio (legacy, also Penpot's export): tokens have `value` and `type`, and a file
//   with `$themes` or `$metadata` holds several sets as its top-level keys.
//
// Light and dark values come from set names (resolve.ts) or, per token, from
// `$extensions.mode: { light, dark }`, the convention Terrazzo uses and our own export writes.

export type TokenFormat = "dtcg" | "tokens_studio";

// The value types a slot can be mapped from. Anything else is kept as "other" and listed, but
// can't be mapped.
export type TokenType =
  | "color"
  | "dimension"
  | "number"
  | "fontFamily"
  | "fontWeight"
  | "string"
  | "other";

export interface RawToken {
  path: string;
  // Null when neither the token nor a group declares one; an alias then takes its target's type.
  type: TokenType | null;
  // The type as written in the file, for the admin.
  declaredType: string | null;
  value: unknown;
  // Per-token mode values from `$extensions.mode`.
  modes?: { light?: unknown; dark?: unknown };
}

export interface TokenSet {
  name: string;
  tokens: RawToken[];
}

export interface ParsedFile {
  name: string;
  format: TokenFormat;
  sets: TokenSet[];
}

export interface ThemeIssue {
  severity: "error" | "warning";
  message: string;
  // The token or slot it concerns.
  path?: string;
}

export interface TokenFile {
  name: string;
  content: unknown;
}

const DTCG_TYPES: Record<string, TokenType> = {
  color: "color",
  dimension: "dimension",
  number: "number",
  fontFamily: "fontFamily",
  fontWeight: "fontWeight",
};

const STUDIO_TYPES: Record<string, TokenType> = {
  color: "color",
  dimension: "dimension",
  sizing: "dimension",
  spacing: "dimension",
  borderRadius: "dimension",
  borderWidth: "dimension",
  fontSizes: "dimension",
  letterSpacing: "dimension",
  paragraphSpacing: "dimension",
  fontFamilies: "fontFamily",
  fontWeights: "fontWeight",
  opacity: "number",
  number: "number",
  text: "string",
};

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function setNameFromFile(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? fileName;
  return base.replace(/(\.tokens)?\.json$/i, "") || "tokens";
}

function hasKeyDeep(node: unknown, key: string, depth = 0): boolean {
  if (!isObject(node) || depth > 12) return false;
  if (key in node) return true;
  return Object.values(node).some((v) => hasKeyDeep(v, key, depth + 1));
}

export function detectFormat(content: unknown): TokenFormat | null {
  if (hasKeyDeep(content, "$value")) return "dtcg";
  if (hasKeyDeep(content, "value")) return "tokens_studio";
  return null;
}

// DTCG forbids these in names, because they are the alias syntax.
const BAD_NAME = /[{}.]/;

function modeValues(extensions: unknown): RawToken["modes"] {
  if (!isObject(extensions) || !isObject(extensions.mode)) return undefined;
  const { light, dark } = extensions.mode;
  if (light === undefined && dark === undefined) return undefined;
  return { light, dark };
}

function walkDtcg(
  node: Record<string, unknown>,
  path: string[],
  inherited: string | null,
  out: RawToken[],
  issues: ThemeIssue[],
) {
  for (const [key, child] of Object.entries(node)) {
    if (key.startsWith("$")) continue;
    if (!isObject(child)) continue;
    const childPath = [...path, key];
    if (BAD_NAME.test(key)) {
      issues.push({
        severity: "warning",
        path: childPath.join("."),
        message: `Skipped "${key}": token names can't contain { } or .`,
      });
      continue;
    }
    const declared = typeof child.$type === "string" ? child.$type : inherited;
    if ("$value" in child) {
      out.push({
        path: childPath.join("."),
        type: declared ? (DTCG_TYPES[declared] ?? "other") : null,
        declaredType: declared,
        value: child.$value,
        modes: modeValues(child.$extensions),
      });
    } else {
      walkDtcg(child, childPath, declared, out, issues);
    }
  }
}

function walkStudio(
  node: Record<string, unknown>,
  path: string[],
  out: RawToken[],
  issues: ThemeIssue[],
) {
  for (const [key, child] of Object.entries(node)) {
    if (key.startsWith("$") || !isObject(child)) continue;
    const childPath = [...path, key];
    if (BAD_NAME.test(key)) {
      issues.push({
        severity: "warning",
        path: childPath.join("."),
        message: `Skipped "${key}": token names can't contain { } or .`,
      });
      continue;
    }
    // A token is an object with `value` that isn't itself a group of tokens.
    if ("value" in child && !isObject(child.value)) {
      const declared = typeof child.type === "string" ? child.type : null;
      out.push({
        path: childPath.join("."),
        type: declared ? (STUDIO_TYPES[declared] ?? "other") : null,
        declaredType: declared,
        value: child.value,
        modes: modeValues(child.$extensions),
      });
    } else if ("value" in child && isObject(child.value) && "type" in child) {
      // A composite token (typography, shadow). Listed, but no slot takes one.
      out.push({
        path: childPath.join("."),
        type: "other",
        declaredType: String(child.type),
        value: child.value,
      });
    } else {
      walkStudio(child, childPath, out, issues);
    }
  }
}

export function parseTokenFile(file: TokenFile): {
  parsed: ParsedFile | null;
  issues: ThemeIssue[];
} {
  const issues: ThemeIssue[] = [];
  const { content } = file;
  if (!isObject(content)) {
    return {
      parsed: null,
      issues: [{ severity: "error", message: `${file.name}: expected a JSON object of tokens` }],
    };
  }
  const format = detectFormat(content);
  if (!format) {
    return {
      parsed: null,
      issues: [
        {
          severity: "error",
          message: `${file.name}: no tokens found. Export in the W3C design tokens (DTCG) or Tokens Studio format.`,
        },
      ],
    };
  }

  const walk = (node: Record<string, unknown>): RawToken[] => {
    const tokens: RawToken[] = [];
    if (format === "dtcg")
      walkDtcg(node, [], typeof node.$type === "string" ? node.$type : null, tokens, issues);
    else walkStudio(node, [], tokens, issues);
    return tokens;
  };

  const sets: TokenSet[] = [];
  // Tokens Studio and Penpot write several sets into one file, in either value syntax, and mark
  // it with $themes or $metadata. $metadata.tokenSetOrder, when present, is the order sets apply in.
  if ("$themes" in content || "$metadata" in content) {
    const metadata = isObject(content.$metadata) ? content.$metadata : {};
    const declared = Array.isArray(metadata.tokenSetOrder)
      ? metadata.tokenSetOrder.filter((n): n is string => typeof n === "string")
      : [];
    const names = [
      ...declared.filter((n) => isObject(content[n])),
      ...Object.keys(content).filter((n) => !n.startsWith("$") && !declared.includes(n)),
    ];
    for (const name of names) {
      const node = content[name];
      if (isObject(node)) sets.push({ name, tokens: walk(node) });
    }
  } else {
    sets.push({ name: setNameFromFile(file.name), tokens: walk(content) });
  }

  if (sets.every((s) => s.tokens.length === 0)) {
    issues.push({ severity: "error", message: `${file.name}: no tokens found` });
    return { parsed: null, issues };
  }
  return { parsed: { name: file.name, format, sets }, issues };
}
