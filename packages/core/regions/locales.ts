// The languages a user can choose for place names (Phase 6, §7.1). Country names come from the
// runtime's ICU data, which covers each of these; subdivision names stay as ISO 3166-2 publishes
// them. The rest of the interface is English. Stored as text in app_user.locale, so adding a
// language here needs no migration.
export const UI_LOCALES = [
  "en", "ar", "cs", "da", "de", "es", "fi", "fr", "he", "hi", "it", "ja", "ko", "nb", "nl",
  "pl", "pt", "ru", "sv", "tr", "uk", "zh-Hans", "zh-Hant",
] as const;
export type UiLocale = (typeof UI_LOCALES)[number];
export const DEFAULT_UI_LOCALE: UiLocale = "en";

export function isUiLocale(value: unknown): value is UiLocale {
  return (UI_LOCALES as readonly unknown[]).includes(value);
}

// "Deutsch (German)": the language's own name, then its English name for anyone who can't read
// the first. English alone for English.
export function uiLocaleLabel(locale: UiLocale): string {
  const english = new Intl.DisplayNames(["en"], { type: "language" }).of(locale) ?? locale;
  const own = new Intl.DisplayNames([locale], { type: "language" }).of(locale) ?? english;
  const ownCased = own.charAt(0).toLocaleUpperCase(locale) + own.slice(1);
  return ownCased === english ? english : `${ownCased} (${english})`;
}
