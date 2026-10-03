import { readFileSync } from "node:fs";
import type { TokenFile } from "../parse";

// Hand-written from the published formats of Figma's Variables export (one DTCG file per mode),
// Tokens Studio's legacy multi-set file, and Penpot's DTCG-syntax multi-set file. Replace them
// with real exports once the design tokens spike (plan.md §2) has run.
export function fixture(name: string): TokenFile {
  return { name, content: JSON.parse(readFileSync(new URL(`./${name}`, import.meta.url), "utf8")) };
}
