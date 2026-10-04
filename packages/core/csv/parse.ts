import { parse } from "csv-parse/sync";

export interface CsvRecord {
  line: number;
  values: Record<string, string>;
}

export interface CsvIssue {
  line: number;
  message: string;
}

export interface ParsedCsv {
  records: CsvRecord[];
  // The columns the header row named, after aliases. Lets a caller tell a blank cell from a
  // column the file doesn't have.
  headers?: string[];
  fatal?: string;
}

interface CsvShape {
  // Every column the caller understands. Missing cells come back as "".
  columns: readonly string[];
  // Columns that must appear in the header row. Others may be left out of the file.
  required: readonly string[];
  // Old header names and the column they now mean, so older spreadsheets keep importing.
  // Ignored when the file also has the new name.
  aliases?: Readonly<Record<string, string>>;
}

// Header names are case-insensitive and trimmed. Unknown columns are ignored, so someone can
// add a private column to the spreadsheet without breaking the import.
export function parseCsv(text: string, shape: CsvShape): ParsedCsv {
  let headers: string[] = [];
  try {
    const rows = parse(text, {
      bom: true,
      trim: true,
      skip_empty_lines: true,
      relax_column_count: true,
      info: true,
      columns: (header: string[]) => {
        const lowered = header.map((h) => h.trim().toLowerCase());
        const normalized = lowered.map((h) => {
          const target = shape.aliases?.[h];
          return target && !lowered.includes(target) ? target : h;
        });
        const missing = shape.required.filter((r) => !normalized.includes(r));
        if (missing.length > 0) {
          throw new Error(`Missing required column(s): ${missing.join(", ")}`);
        }
        headers = normalized;
        return normalized;
      },
    }) as { record: Record<string, string | undefined>; info: { lines: number } }[];

    const records = rows.map(({ record, info }) => ({
      line: info.lines,
      values: Object.fromEntries(shape.columns.map((key) => [key, (record[key] ?? "").trim()])),
    }));
    return { records, headers };
  } catch (error) {
    return { records: [], fatal: error instanceof Error ? error.message : String(error) };
  }
}
