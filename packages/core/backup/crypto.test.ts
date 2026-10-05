import { describe, expect, it } from "vitest";
import { decryptExport, encryptExport, ExportFileError } from "./crypto";

const PASS = "correct horse battery";
const DATA = JSON.stringify({ people: [{ name: "Zoë Ångström" }] });

describe("encryptExport / decryptExport", () => {
  it("round-trips, and two exports of the same data differ", () => {
    const a = JSON.stringify(encryptExport(DATA, PASS));
    const b = JSON.stringify(encryptExport(DATA, PASS));
    expect(a).not.toBe(b);
    expect(decryptExport(a, PASS)).toBe(DATA);
    // The plaintext doesn't appear, in any encoding. (Short fragments can occur by chance in the
    // random base64 ciphertext, so the check uses the whole value.)
    expect(a).not.toContain("Ångström");
    expect(a).not.toContain(Buffer.from(DATA).toString("base64").slice(0, 24));
  });

  it("fails cleanly on a wrong passphrase", () => {
    const file = JSON.stringify(encryptExport(DATA, PASS));
    expect(() => decryptExport(file, "wrong passphrase!")).toThrow(/passphrase is wrong/);
  });

  it("fails the integrity check when a byte has changed", () => {
    const file = encryptExport(DATA, PASS);
    const bytes = Buffer.from(file.ciphertext, "base64");
    bytes[0] = bytes[0]! ^ 1;
    const tampered = JSON.stringify({ ...file, ciphertext: bytes.toString("base64") });
    expect(() => decryptExport(tampered, PASS)).toThrow(ExportFileError);
  });

  it("reads files written under the old OfficeOrg format id", () => {
    const file = { ...encryptExport(DATA, PASS), format: "officeorg-export" };
    expect(decryptExport(JSON.stringify(file), PASS)).toBe(DATA);
  });

  it("refuses a short passphrase, other files and other versions", () => {
    expect(() => encryptExport(DATA, "short")).toThrow(/at least 12/);
    expect(() => decryptExport("not json", PASS)).toThrow(/isn't JSON/);
    expect(() => decryptExport("{}", PASS)).toThrow(/isn't an OrOv export/);
    expect(() => decryptExport(JSON.stringify({ ...encryptExport(DATA, PASS), format: "other-export" }), PASS)).toThrow(
      /isn't an OrOv export/,
    );
    const file = encryptExport(DATA, PASS);
    expect(() => decryptExport(JSON.stringify({ ...file, version: 2 }), PASS)).toThrow(/version 2/);
    expect(() => decryptExport(JSON.stringify({ ...file, kdf: { ...file.kdf, N: 2 ** 30 } }), PASS)).toThrow(
      /key settings/,
    );
  });
});
