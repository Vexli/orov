import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defaultThemeCss } from "@orov/core/theme/emit-css";
import { exportThemeTokens } from "@orov/core/theme/export";
import { defaultThemeValues } from "@orov/core/theme/values";

// Writes the default theme from packages/core/theme/slots.ts twice: as CSS bundled with
// globals.css, and as the DTCG token file in theme/ that documents the slots and serves as the
// default when no theme has been applied. CI regenerates both and fails if either differs, so
// neither can drift from the slot list.
const css = fileURLToPath(new URL("../app/theme-defaults.css", import.meta.url));
writeFileSync(css, defaultThemeCss());
console.log(`wrote ${css}`);

const tokens = fileURLToPath(new URL("../../../theme/default.tokens.json", import.meta.url));
const description =
  "OrOv's default theme. Generated from packages/core/theme/slots.ts by `pnpm theme:defaults`; do not edit. See docs/theming.md.";
writeFileSync(
  tokens,
  `${JSON.stringify(exportThemeTokens(defaultThemeValues(), description), null, 2)}\n`,
);
console.log(`wrote ${tokens}`);
