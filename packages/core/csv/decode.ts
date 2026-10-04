// Turns an uploaded file's bytes into text. Spreadsheets arrive in whatever encoding the app that
// saved them chose: Excel's "CSV" is Windows-1252 on most Windows setups, and its "Unicode Text"
// is UTF-16. Decoding everything as UTF-8 silently turns their accented letters into U+FFFD.
// Pure and browser-safe: the import page decodes before sending text to the server.

export const CSV_ENCODINGS = ["utf-8", "windows-1252", "utf-16le", "utf-16be"] as const;
export type CsvEncoding = (typeof CSV_ENCODINGS)[number];

export const CSV_ENCODING_LABELS: Record<CsvEncoding, string> = {
  "utf-8": "UTF-8",
  "windows-1252": "Windows-1252 (Western European)",
  "utf-16le": "UTF-16 LE",
  "utf-16be": "UTF-16 BE",
};

export interface DecodedCsv {
  text: string;
  encoding: CsvEncoding;
  // True when the encoding is a fallback guess rather than certain (a BOM, or valid UTF-8).
  guessed: boolean;
}

// `encoding` forces one, for when the admin overrides the detection.
export function decodeCsv(bytes: Uint8Array, encoding?: CsvEncoding): DecodedCsv {
  if (encoding) return { text: decode(bytes, encoding), encoding, guessed: false };

  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { text: decode(bytes, "utf-16le"), encoding: "utf-16le", guessed: false };
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { text: decode(bytes, "utf-16be"), encoding: "utf-16be", guessed: false };

  const utf16 = utf16WithoutBom(bytes);
  if (utf16) return { text: decode(bytes, utf16), encoding: utf16, guessed: true };

  try {
    // A UTF-8 BOM is stripped by the decoder.
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), encoding: "utf-8", guessed: false };
  } catch {
    // Not valid UTF-8. Windows-1252 decodes any byte, and is what Excel writes on Western setups.
    return { text: decode(bytes, "windows-1252"), encoding: "windows-1252", guessed: true };
  }
}

function decode(bytes: Uint8Array, encoding: CsvEncoding): string {
  return new TextDecoder(encoding).decode(bytes);
}

// Text in UTF-16 without a byte order mark is mostly ASCII with a zero byte beside every
// character. A CSV in a single-byte encoding never has zero bytes.
function utf16WithoutBom(bytes: Uint8Array): CsvEncoding | null {
  const sample = bytes.subarray(0, 512);
  if (sample.length < 4 || sample.length % 2 !== 0) return null;
  let evenZeros = 0;
  let oddZeros = 0;
  for (let i = 0; i < sample.length; i += 2) {
    if (sample[i] === 0) evenZeros++;
    if (sample[i + 1] === 0) oddZeros++;
  }
  const pairs = sample.length / 2;
  if (oddZeros > pairs * 0.4 && evenZeros === 0) return "utf-16le";
  if (evenZeros > pairs * 0.4 && oddZeros === 0) return "utf-16be";
  return null;
}
