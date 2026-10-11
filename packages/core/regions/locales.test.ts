import { describe, expect, it } from "vitest";
import { isUiLocale, uiLocaleLabel, UI_LOCALES } from "./locales";

describe("UI locales", () => {
  it("accepts only the listed languages", () => {
    expect(isUiLocale("de")).toBe(true);
    expect(isUiLocale("zh-Hant")).toBe(true);
    for (const value of ["DE", "de-DE", "xx", "", null]) expect(isUiLocale(value), String(value)).toBe(false);
  });

  it("names each language in itself, then in English", () => {
    expect(uiLocaleLabel("en")).toBe("English");
    expect(uiLocaleLabel("de")).toBe("Deutsch (German)");
    expect(uiLocaleLabel("fr")).toBe("Français (French)");
    for (const locale of UI_LOCALES) expect(uiLocaleLabel(locale)).not.toBe(locale);
  });
});
