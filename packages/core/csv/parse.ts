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
  fatal?: string;
}

interface CsvShape {
  // Every column the caller understands. Missing cells come back as "".
  columns: readonly string[];
  // Columns that must appear in the header row. Others may be left out of the file.
  required: readonly string[];
}

// Header names are case-insensitive and trimmed. Unknown columns are ignored, so someone can
// add a private column to the spreadsheet without breaking the import.
export function parseCsv(text: string, shape: CsvShape): ParsedCsv {
  try {
    const rows = parse(text, {
      bom: true,
      trim: true,
      skip_empty_lines: true,
      relax_column_count: true,
      info: true,
      columns: (header: string[]) => {
        const normalized = header.map((h) => h.trim().toLowerCase());
        const missing = shape.required.filter((r) => !normalized.includes(r));
        if (missing.length > 0) {
          throw new Error(`Missing required column(s): ${missing.join(", ")}`);
        }
        return normalized;
      },
    }) as { record: Record<string, string | undefined>; info: { lines: number } }[];

    const records = rows.map(({ record, info }) => ({
      line: info.lines,
      values: Object.fromEntries(shape.columns.map((key) => [key, (record[key] ?? "").trim()])),
    }));
    return { records };
  } catch (error) {
    return { records: [], fatal: error instanceof Error ? error.message : String(error) };
  }
}
