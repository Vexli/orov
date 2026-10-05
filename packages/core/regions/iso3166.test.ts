import { describe, expect, it } from "vitest";
import {
  flagEmoji,
  formatRegion,
  regionLabel,
  isKnownRegion,
  isRegionDisplay,
  normalizeRegionCode,
  REGION_DISPLAYS,
  regionCodeSchema,
  searchRegions,
  subdivisionName,
} from "./iso3166";

describe("isKnownRegion", () => {
  it("accepts assigned countries and listed subdivisions", () => {
    for (const code of ["US", "CA", "IN", "US-CA", "CA-ON", "GB-SCT", "FR-75C", "ES-M"]) {
      expect(isKnownRegion(code), code).toBe(true);
    }
  });

  it("rejects well-formed codes that ISO 3166 doesn't list", () => {
    for (const code of ["XX", "US-XX", "ZZ-CA", "CA-CA"]) {
      expect(isKnownRegion(code), code).toBe(false);
    }
  });

  it("rejects malformed codes", () => {
    for (const code of ["us", "USA", "US-", "US-CALI", "US_CA", ""]) {
      expect(isKnownRegion(code), code).toBe(false);
    }
  });
});

describe("regionCodeSchema", () => {
  const schema = regionCodeSchema("home_region");

  it("normalizes case and whitespace", () => {
    expect(normalizeRegionCode(" us-ca ")).toBe("US-CA");
    expect(schema.parse(" ca-on")).toBe("CA-ON");
  });

  it("names the field and gives an example for a malformed code", () => {
    expect(schema.safeParse("USA").error?.issues[0]?.message).toBe(
      "home_region must be an ISO 3166 code, such as US or US-CA",
    );
  });

  it("names the code for one that is well formed but unknown", () => {
    expect(schema.safeParse("US-XX").error?.issues[0]?.message).toBe(
      'home_region "US-XX" is not an ISO 3166 country or subdivision code',
    );
  });
});

describe("formatRegion", () => {
  const table: [string, Record<(typeof REGION_DISPLAYS)[number], string>][] = [
    [
      "US-CA",
      {
        code: "US-CA",
        country: "United States",
        region: "California",
        country_region: "California, United States",
        // The flag-only mode's text: the country, for screen readers.
        flag: "United States",
      },
    ],
    [
      "CA-ON",
      { code: "CA-ON", country: "Canada", region: "Ontario", country_region: "Ontario, Canada", flag: "Canada" },
    ],
    [
      "GB-SCT",
      {
        code: "GB-SCT",
        country: "United Kingdom",
        region: "Scotland",
        country_region: "Scotland, United Kingdom",
        flag: "United Kingdom",
      },
    ],
    // A country-only code falls back to the country name instead of showing nothing.
    ["IN", { code: "IN", country: "India", region: "India", country_region: "India", flag: "India" }],
  ];

  for (const [code, expected] of table) {
    for (const display of REGION_DISPLAYS) {
      it(`shows ${code} as "${expected[display]}" for ${display}`, () => {
        expect(formatRegion(code, display)).toBe(expected[display]);
      });
    }
  }

  it("names a nested subdivision by its own name", () => {
    expect(subdivisionName("FR-75C")).toBe("Paris");
    expect(formatRegion("FR-75C", "country_region")).toBe("Paris, France");
  });

  it("shows an unknown code as-is, so legacy data still renders", () => {
    expect(formatRegion("XX", "country_region")).toBe("XX");
  });

  it("translates country names with the locale", () => {
    expect(formatRegion("DE-BY", "country", "de")).toBe("Deutschland");
  });
});

describe("isRegionDisplay", () => {
  it("accepts only the stored preference values", () => {
    expect(REGION_DISPLAYS.every(isRegionDisplay)).toBe(true);
    expect(isRegionDisplay("name")).toBe(false);
    expect(isRegionDisplay(null)).toBe(false);
  });
});

describe("flagEmoji", () => {
  it.each([
    ["CA", "🇨🇦"],
    ["CA-ON", "🇨🇦"],
    ["IN-KA", "🇮🇳"],
    ["FR-75C", "🇫🇷"],
  ])("%s → %s", (code, flag) => {
    expect(flagEmoji(code)).toBe(flag);
  });

  it.each(["XX", "XX-1", "ca", ""])("has no flag for %j", (code) => {
    expect(flagEmoji(code)).toBeNull();
  });
});

describe("regionLabel", () => {
  it("adds the flag only when asked, in every display mode", () => {
    expect(regionLabel("CA-ON", { display: "country_region", flag: true })).toEqual({
      label: "Ontario, Canada",
      flag: "🇨🇦",
      flagOnly: false,
    });
    expect(regionLabel("CA-ON", { display: "code", flag: true })).toEqual({ label: "CA-ON", flag: "🇨🇦", flagOnly: false });
    expect(regionLabel("CA-ON", { display: "country_region", flag: false }).flag).toBeNull();
  });

  it("shows the flag alone in flag-only mode, keeping the country name for screen readers", () => {
    expect(regionLabel("CA-ON", { display: "flag", flag: false })).toEqual({
      label: "Canada",
      flag: "🇨🇦",
      flagOnly: true,
    });
    // A code without a country falls back to the code.
    expect(regionLabel("XX", { display: "flag", flag: false })).toEqual({ label: "XX", flag: null, flagOnly: false });
  });
});

describe("searchRegions", () => {
  const codes = (q: string, limit?: number) => searchRegions(q, limit).map((r) => r.code);

  it("finds a subdivision by name, with its full label", () => {
    expect(searchRegions("ontario")[0]).toEqual({ code: "CA-ON", label: "Ontario, Canada" });
  });

  it("puts an exact code first", () => {
    expect(codes("us-ca")[0]).toBe("US-CA");
    expect(codes("ca")[0]).toBe("CA");
    expect(codes("US")[0]).toBe("US");
  });

  it("lists a country before its subdivisions", () => {
    const found = codes("canada", 50);
    expect(found[0]).toBe("CA");
    expect(found).toContain("CA-ON");
    expect(found).toContain("CA-QC");
  });

  it("matches every word as a prefix", () => {
    expect(codes("new y")).toContain("US-NY");
    expect(codes("york new")).toContain("US-NY");
    expect(codes("new zzz")).toEqual([]);
  });

  it("ignores accents and case", () => {
    expect(codes("karnataka")).toContain("IN-KA");
    expect(codes("QUEBEC")).toContain("CA-QC");
  });

  it("returns nothing for a blank query and honors the limit", () => {
    expect(searchRegions("  ")).toEqual([]);
    expect(searchRegions("a", 5)).toHaveLength(5);
  });
});
