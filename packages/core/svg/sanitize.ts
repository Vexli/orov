import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";
import { optimize } from "svgo";

// Cleans an uploaded floor drawing before it is stored (plan.md §6, docs/map-authoring.md).
// The result is injected into the page as markup, so this is an XSS boundary, not a nicety.
//
// Server only: it loads jsdom. It isn't exported from the package index, so client components
// can't pull it in by accident.
//
// SVGO runs first, to copy <style> rules onto the elements they match and drop the editor
// cruft. DOMPurify runs last, so nothing after the security pass can add markup back.

export const MAX_SVG_BYTES = 2 * 1024 * 1024;

// The problem with an upload, worded for the admin who uploaded it.
export class SvgError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SvgError";
  }
}

let purifier: ReturnType<typeof createDOMPurify> | null = null;

function getPurifier() {
  if (purifier) return purifier;
  const purify = createDOMPurify(new JSDOM("").window as unknown as Window & typeof globalThis);

  // Links and images may point inside the drawing (#id) or embed a raster image. Anything that
  // would make the browser fetch another URL is dropped, and so is any attribute whose value
  // references an outside URL through CSS, such as fill="url(https://…)".
  purify.addHook("uponSanitizeAttribute", (node, data) => {
    const name = data.attrName.toLowerCase();
    const value = data.attrValue.trim();
    if (name === "href" || name === "xlink:href") {
      const internal = value.startsWith("#");
      const embeddedImage =
        node.nodeName.toLowerCase() === "image" &&
        /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(value);
      if (!internal && !embeddedImage) data.keepAttr = false;
      return;
    }
    if (referencesOutsideUrl(value)) data.keepAttr = false;
  });
  purifier = purify;
  return purify;
}

// True if any url(…) in a CSS value points anywhere other than an id in the same drawing.
const URL_REF = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/gi;

export function referencesOutsideUrl(value: string): boolean {
  for (const m of value.matchAll(URL_REF)) {
    const target = (m[1] ?? m[2] ?? m[3] ?? "").trim();
    if (!target.startsWith("#")) return true;
  }
  // What's left over must not hold an unterminated url(, which can't be judged.
  return /url\(/i.test(value.replace(URL_REF, ""));
}

const SVGO_PLUGINS = [
  "removeDoctype",
  "removeXMLProcInst",
  "removeComments",
  "removeMetadata",
  "removeEditorsNSData",
  // Copies every <style> rule onto the elements it matches, so the drawing looks the same once
  // the <style> block is gone. An inline <style> in the page would apply to the whole app.
  { name: "inlineStyles", params: { onlyMatchedOnce: false } },
  "removeStyleElement",
  "removeScripts",
  "cleanupAttrs",
] as const;

export function sanitizeSvg(input: string): string {
  if (Buffer.byteLength(input, "utf8") > MAX_SVG_BYTES) {
    throw new SvgError(`The file is larger than ${MAX_SVG_BYTES / 1024 / 1024} MB.`);
  }
  if (!/<svg[\s>]/i.test(input)) throw new SvgError("The file isn't an SVG drawing.");

  let optimized: string;
  try {
    // cleanupIds is deliberately left out: it renames ids, and ids are how the app finds desks.
    optimized = optimize(input, { multipass: false, plugins: [...SVGO_PLUGINS] }).data;
  } catch (error) {
    throw new SvgError(`The file isn't valid SVG: ${(error as Error).message.split("\n")[0]}`);
  }

  const purify = getPurifier();
  const clean = purify.sanitize(optimized, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ["style", "foreignObject", "script"],
    // DOMPurify leaves <use> out because it can load another document. The href hook above only
    // lets it point inside this drawing, and Illustrator draws repeated symbols with it.
    ADD_TAGS: ["use"],
    RETURN_DOM_FRAGMENT: true,
  });

  const root = clean.firstElementChild;
  if (!root || root.tagName.toLowerCase() !== "svg") {
    throw new SvgError("The file doesn't contain an <svg> element.");
  }
  normalizeRoot(root);
  return root.outerHTML;
}

// The map needs a viewBox to scale the drawing. A file with only width and height gets one from
// those. Fixed dimensions are dropped, so the drawing fills whatever space the map gives it.
function normalizeRoot(root: Element) {
  const width = parseFloat(root.getAttribute("width") ?? "");
  const height = parseFloat(root.getAttribute("height") ?? "");
  if (!root.getAttribute("viewBox")) {
    if (!(width > 0 && height > 0)) {
      throw new SvgError("The <svg> element needs a viewBox (or a width and a height).");
    }
    root.setAttribute("viewBox", `0 0 ${width} ${height}`);
  }
  const viewBox = (root.getAttribute("viewBox") ?? "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (
    viewBox.length !== 4 ||
    viewBox.some((n) => !Number.isFinite(n)) ||
    viewBox[2]! <= 0 ||
    viewBox[3]! <= 0
  ) {
    throw new SvgError("The <svg> element's viewBox isn't four numbers with a positive size.");
  }
  root.removeAttribute("width");
  root.removeAttribute("height");
}
