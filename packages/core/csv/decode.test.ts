import { describe, expect, it } from "vitest";
import { decodeCsv } from "./decode";
import { parsePeopleCsv } from "./people";

const TEXT = "email,name,home_region\njose@x.com,José Müller,ES\nzoe@x.com,Zoë Ångström,SE\n";

// The same text as each encoding would store it.
const latin1 = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0)); // fine for U+0000–U+00FF
const utf16 = (s: string, le: boolean, bom: boolean) => {
  const out: number[] = bom ? (le ? [0xff, 0xfe] : [0xfe, 0xff]) : [];
  for (const c of s) {
    const code = c.charCodeAt(0);
    out.push(...(le ? [code & 0xff, code >> 8] : [code >> 8, code & 0xff]));
  }
  return Uint8Array.from(out);
};

describe("decodeCsv", () => {
  it("reads UTF-8, with or without a BOM", () => {
    const bytes = new TextEncoder().encode(TEXT);
    expect(decodeCsv(bytes)).toEqual({ text: TEXT, encoding: "utf-8", guessed: false });
    const withBom = Uint8Array.from([0xef, 0xbb, 0xbf, ...bytes]);
    expect(decodeCsv(withBom).text).toBe(TEXT);
  });

  it("falls back to Windows-1252 for bytes that aren't UTF-8, and says it guessed", () => {
    expect(decodeCsv(latin1(TEXT))).toEqual({ text: TEXT, encoding: "windows-1252", guessed: true });
  });

  it("decodes Windows-1252's own characters, such as curly quotes and the euro sign", () => {
    expect(decodeCsv(Uint8Array.from([0x93, 0x80, 0x94])).text).toBe("“€”");
  });

  it("reads UTF-16 by its BOM, in either byte order", () => {
    expect(decodeCsv(utf16(TEXT, true, true))).toEqual({ text: TEXT, encoding: "utf-16le", guessed: false });
    expect(decodeCsv(utf16(TEXT, false, true))).toEqual({ text: TEXT, encoding: "utf-16be", guessed: false });
  });

  it("recognizes UTF-16 without a BOM by its zero bytes", () => {
    expect(decodeCsv(utf16(TEXT, true, false))).toMatchObject({ text: TEXT, encoding: "utf-16le", guessed: true });
  });

  it("uses the encoding it's given", () => {
    // Valid UTF-8 read as Windows-1252 on purpose: "é" becomes two characters.
    const bytes = new TextEncoder().encode("é");
    expect(decodeCsv(bytes, "windows-1252")).toEqual({ text: "Ã©", encoding: "windows-1252", guessed: false });
  });
});

describe("importing Excel files", () => {
  it("imports a Windows-1252 file's accented names", () => {
    const { rows, issues } = parsePeopleCsv(decodeCsv(latin1(TEXT)).text);
    expect(issues).toEqual([]);
    expect(rows.map((r) => r.record.name)).toEqual(["José Müller", "Zoë Ångström"]);
  });

  it("imports Excel's tab-separated UTF-16 'Unicode Text'", () => {
    const { rows, issues } = parsePeopleCsv(decodeCsv(utf16(TEXT.replaceAll(",", "\t"), true, true)).text);
    expect(issues).toEqual([]);
    expect(rows.map((r) => r.record.name)).toEqual(["José Müller", "Zoë Ångström"]);
  });

  it("imports a semicolon-separated file, keeping a quoted teams list intact", () => {
    const text = 'email;name;home_region;teams\nbob@x.com;Bob;US;"hr;payroll"\n';
    expect(parsePeopleCsv(text).rows[0]?.record.teamSlugs).toEqual(["hr", "payroll"]);
  });

  it("stores decomposed (NFD) accents in composed (NFC) form", () => {
    const nfd = "email,name,home_region\njose@x.com,José,ES\n";
    expect(parsePeopleCsv(nfd).rows[0]?.record.name).toBe("José".normalize("NFC"));
  });
});
