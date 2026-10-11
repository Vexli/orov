import { SLOTS } from "./slots";

export type ThemeMode = "light" | "dark";

// A theme's final value for every slot, by mode. Each value has passed the grammar in
// validate.ts, so it is safe to write into CSS as is. `dark` is null for a light-only theme,
// which then never follows the viewer's dark-mode preference.
export interface ThemeValues {
  light: Record<string, string>;
  dark: Record<string, string> | null;
}

export function defaultThemeValues(): ThemeValues {
  const light: Record<string, string> = {};
  const dark: Record<string, string> = {};
  for (const slot of SLOTS) {
    light[slot.name] = slot.light;
    dark[slot.name] = slot.dark ?? slot.light;
  }
  return { light, dark };
}
