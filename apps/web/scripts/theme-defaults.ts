import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defaultThemeCss } from "@officeorg/core/theme/slots";

// Writes the default theme from packages/core/theme/slots.ts. CI regenerates it and fails if the
// checked-in file differs, so the CSS can't drift from the slot list.
const target = fileURLToPath(new URL("../app/theme-defaults.css", import.meta.url));
writeFileSync(target, defaultThemeCss());
console.log(`wrote ${target}`);
