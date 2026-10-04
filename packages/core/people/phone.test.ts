import { describe, expect, it } from "vitest";
import { displayPhone, normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it.each([
    ["(415) 555-0123", "US-CA", "+14155550123"],
    ["415.555.0123", "US", "+14155550123"],
    ["416-555-0199", "CA-ON", "+14165550199"],
    ["020 7946 0018", "GB", "+442079460018"],
    ["080 1234 5678", "IN-KA", "+918012345678"],
    // A country code wins over the home region.
    ["+44 20 7946 0018", "US-CA", "+442079460018"],
    ["+1 415 555 0123 ext. 12", "US", "+14155550123;ext=12"],
  ])("%s in %s → %s", (raw, region, value) => {
    expect(normalizePhone(raw, region)).toEqual({ ok: true, value });
  });

  it("treats blank as no number", () => {
    expect(normalizePhone("  ", "US")).toEqual({ ok: true, value: null });
    expect(normalizePhone(null, "US")).toEqual({ ok: true, value: null });
  });

  it.each(["garbage", "12", "555-0123", "+1 000 000 0000"])("refuses %j", (raw) => {
    expect(normalizePhone(raw, "US").ok).toBe(false);
  });

  it("is stable: a stored number normalizes to itself", () => {
    expect(normalizePhone("+442079460018", "US")).toEqual({ ok: true, value: "+442079460018" });
    expect(normalizePhone("+14155550123;ext=12", "GB")).toEqual({ ok: true, value: "+14155550123;ext=12" });
  });
});

describe("displayPhone", () => {
  it("formats a stored number for display and a tel: link", () => {
    expect(displayPhone("+14155550123")).toEqual({ uri: "tel:+14155550123", label: "+1 415 555 0123" });
    expect(displayPhone("+14155550123;ext=12")).toEqual({
      uri: "tel:+14155550123;ext=12",
      label: "+1 415 555 0123 ext. 12",
    });
  });

  it("shows an old unvalidated value as it is, without a link", () => {
    expect(displayPhone("call reception")).toEqual({ uri: null, label: "call reception" });
  });
});
