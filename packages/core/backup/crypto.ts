import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

// The encrypted organization export (#29), "orov-export" version 1:
//   { format, version, kdf: { name: "scrypt", N, r, p, salt }, cipher: { name: "AES-256-GCM", iv, tag }, ciphertext }
// The key comes from the admin's passphrase through scrypt, so the file can travel by email or a
// shared drive. GCM authenticates as well as encrypts: a wrong passphrase and a changed byte fail
// the same way, and never decrypt to garbage. Server only (node:crypto); imported by path.

export const EXPORT_FORMAT = "orov-export";
export const EXPORT_VERSION = 1;
export const MIN_PASSPHRASE = 12;

const KDF = { N: 2 ** 15, r: 8, p: 1 };
// scrypt needs 128 × N × r bytes; Node's default cap is 32 MB.
const MAXMEM = 64 * 1024 * 1024;

export interface ExportFile {
  format: typeof EXPORT_FORMAT;
  version: number;
  kdf: { name: "scrypt"; N: number; r: number; p: number; salt: string };
  cipher: { name: "AES-256-GCM"; iv: string; tag: string };
  ciphertext: string;
}

export class ExportFileError extends Error {}

function key(passphrase: string, salt: Buffer, kdf: { N: number; r: number; p: number }): Buffer {
  return scryptSync(passphrase.normalize("NFC"), salt, 32, { ...kdf, maxmem: MAXMEM });
}

export function encryptExport(plaintext: string, passphrase: string): ExportFile {
  if ([...passphrase].length < MIN_PASSPHRASE) {
    throw new ExportFileError(`Use a passphrase of at least ${MIN_PASSPHRASE} characters.`);
  }
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(passphrase, salt, KDF), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    kdf: { name: "scrypt", ...KDF, salt: salt.toString("base64") },
    cipher: { name: "AES-256-GCM", iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64") },
    ciphertext: ciphertext.toString("base64"),
  };
}

export function decryptExport(fileText: string, passphrase: string): string {
  let file: ExportFile;
  try {
    file = JSON.parse(fileText) as ExportFile;
  } catch {
    throw new ExportFileError("This isn't an export file: it isn't JSON.");
  }
  if (file?.format !== EXPORT_FORMAT) throw new ExportFileError("This isn't an OrOv export file.");
  if (file.version !== EXPORT_VERSION) {
    throw new ExportFileError(`This file is format version ${file.version}; this app reads version ${EXPORT_VERSION}.`);
  }
  const { N, r, p, salt } = file.kdf ?? {};
  // Bounds stop a crafted file from asking for an absurd amount of work or memory.
  if (file.kdf?.name !== "scrypt" || !(N >= 2 ** 14 && N <= 2 ** 17) || r !== 8 || !(p >= 1 && p <= 4)) {
    throw new ExportFileError("The file's key settings aren't ones this app writes.");
  }
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key(passphrase, Buffer.from(salt, "base64"), { N, r, p }),
      Buffer.from(file.cipher.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(file.cipher.tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(file.ciphertext, "base64")), decipher.final()]).toString("utf8");
  } catch {
    throw new ExportFileError("The passphrase is wrong, or the file has been changed.");
  }
}
