import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAX_SVG_BYTES, referencesOutsideUrl, sanitizeSvg, SvgError } from "./sanitize";

const wrap = (body: string, attrs = 'viewBox="0 0 100 100"') =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`;

describe("sanitizeSvg", () => {
  it.each([
    ["a script element", '<script>alert(1)</script><rect id="desk-2-001"/>', /<script/i],
    ["an event handler", '<rect id="desk-2-001" onclick="alert(1)"/>', /onclick/i],
    ["an onload on the root's child", '<g onload="alert(1)"><rect/></g>', /onload/i],
    [
      "a foreignObject",
      '<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>',
      /foreignObject|<div/i,
    ],
    ["a javascript: link", '<a href="javascript:alert(1)"><rect/></a>', /javascript:/i],
    ["an external link", '<a href="https://evil.example/"><rect/></a>', /evil\.example/],
    [
      "an external xlink:href",
      '<use xlink:href="https://evil.example/x.svg#a" xmlns:xlink="http://www.w3.org/1999/xlink"/>',
      /evil\.example/,
    ],
    [
      "an external image",
      '<image href="https://evil.example/track.png" width="10" height="10"/>',
      /evil\.example/,
    ],
    [
      "an SVG image as a data URL",
      '<image href="data:image/svg+xml;base64,PHN2Zz4=" width="1" height="1"/>',
      /data:image\/svg/,
    ],
    [
      "a CSS url() to another site",
      '<rect style="fill:url(https://evil.example/a)"/>',
      /evil\.example/,
    ],
    [
      "a fill url() to another site",
      "<rect fill=\"url('https://evil.example/a')\"/>",
      /evil\.example/,
    ],
  ])("removes %s", (_, body, forbidden) => {
    expect(sanitizeSvg(wrap(body))).not.toMatch(forbidden);
  });

  it("removes <style> blocks after copying their rules onto the elements", () => {
    const out = sanitizeSvg(
      wrap(
        '<style>.wall { stroke: #333 } body { display: none }</style><path class="wall" id="w" d="M0 0H10"/>',
      ),
    );
    expect(out).not.toMatch(/<style/i);
    expect(out).not.toMatch(/display:\s*none/);
    expect(out).toMatch(/stroke:\s*#333/);
  });

  it("keeps ids, internal references and embedded raster images", () => {
    const out = sanitizeSvg(
      wrap(
        '<defs><linearGradient id="g"><stop offset="0"/></linearGradient></defs>' +
          '<g id="area-south-wing"><rect id="desk-2-003" fill="url(#g)" x="1" y="1" width="5" height="5"/></g>' +
          '<use href="#desk-2-003"/>' +
          '<image href="data:image/png;base64,iVBORw0KGgo=" width="1" height="1"/>',
      ),
    );
    for (const id of ["area-south-wing", "desk-2-003", "g"]) expect(out).toContain(`id="${id}"`);
    expect(out).toContain('fill="url(#g)"');
    expect(out).toContain('href="#desk-2-003"');
    expect(out).toContain("data:image/png;base64");
  });

  it("keeps every id in the sample floors", () => {
    for (const name of ["sf-2", "sf-3"]) {
      const raw = readFileSync(
        new URL(`../../db/seed-floors/${name}.svg`, import.meta.url),
        "utf8",
      );
      const ids = [...raw.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
      const out = sanitizeSvg(raw);
      for (const id of ids) expect(out).toContain(`id="${id}"`);
    }
  });

  it("derives a viewBox from width and height, and drops fixed dimensions", () => {
    const out = sanitizeSvg(wrap("<rect/>", 'width="300px" height="200"'));
    expect(out).toMatch(/viewBox="0 0 300 200"/);
    expect(out).not.toMatch(/\swidth=|\sheight=/);
  });

  it.each([
    ["no svg element", "<html><body>hi</body></html>", /isn't an SVG/],
    ["malformed XML", '<svg viewBox="0 0 1 1"><rect></svg>', /isn't valid SVG/],
    [
      "no viewBox or size",
      '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>',
      /needs a viewBox/,
    ],
    ["a zero-size viewBox", wrap("<rect/>", 'viewBox="0 0 0 10"'), /positive size/],
    ["a file over the limit", wrap(`<!-- ${"x".repeat(MAX_SVG_BYTES)} -->`), /larger than/],
  ])("rejects %s", (_, input, message) => {
    expect(() => sanitizeSvg(input)).toThrow(SvgError);
    expect(() => sanitizeSvg(input)).toThrow(message);
  });
});

describe("referencesOutsideUrl", () => {
  it.each([
    ["url(#a)", false],
    ["url('#a')", false],
    ['url( "#a" )', false],
    ["fill:url(#a);stroke:url(#b)", false],
    ["#fff", false],
    ["url(https://x)", true],
    ["url('//x/y')", true],
    ["url(data:image/png;base64,AA)", true],
    ["fill:url(#a);stroke:url(x.svg#b)", true],
    ["url(#a", true],
  ])("%s → %s", (value, expected) => {
    expect(referencesOutsideUrl(value)).toBe(expected);
  });
});
