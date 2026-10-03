// Bounding boxes for SVG elements without a browser. The floor parser uses them to place a desk
// in an area when the drawing doesn't nest it (docs/map-authoring.md, "Areas"). Boxes are
// axis-aligned and in the root <svg>'s user units. Curves and arcs are bounded by their control
// and end points, which can overshoot a little; that is fine for "which area holds this center".

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

// [a, b, c, d, e, f] as in SVG's matrix(a b c d e f).
export type Matrix = [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

const NUMBER = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g;

function numbers(value: string | null): number[] {
  return value ? (value.match(NUMBER) ?? []).map(Number) : [];
}

// Parses a transform attribute. Unknown functions are ignored rather than rejected.
export function parseTransform(value: string | null): Matrix {
  if (!value) return IDENTITY;
  let result = IDENTITY;
  for (const [, name, args] of value.matchAll(/([a-zA-Z]+)\s*\(([^)]*)\)/g)) {
    const n = numbers(args!);
    let m: Matrix | null = null;
    switch (name) {
      case "matrix":
        if (n.length === 6) m = n as Matrix;
        break;
      case "translate":
        m = [1, 0, 0, 1, n[0] ?? 0, n[1] ?? 0];
        break;
      case "scale":
        m = [n[0] ?? 1, 0, 0, n[1] ?? n[0] ?? 1, 0, 0];
        break;
      case "rotate": {
        const rad = ((n[0] ?? 0) * Math.PI) / 180;
        const [cos, sin] = [Math.cos(rad), Math.sin(rad)];
        const [cx, cy] = [n[1] ?? 0, n[2] ?? 0];
        m = multiply(multiply([1, 0, 0, 1, cx, cy], [cos, sin, -sin, cos, 0, 0]), [
          1,
          0,
          0,
          1,
          -cx,
          -cy,
        ]);
        break;
      }
      case "skewX":
        m = [1, 0, Math.tan(((n[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
        break;
      case "skewY":
        m = [1, Math.tan(((n[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
        break;
    }
    if (m) result = multiply(result, m);
  }
  return result;
}

const num = (el: Element, attr: string) => {
  const v = parseFloat(el.getAttribute(attr) ?? "");
  return Number.isFinite(v) ? v : 0;
};

// Points that bound the element's own geometry, before its transform.
function localPoints(el: Element): [number, number][] {
  switch (el.tagName.toLowerCase()) {
    case "rect":
    case "image":
    case "use":
    case "foreignobject": {
      const [x, y, w, h] = [num(el, "x"), num(el, "y"), num(el, "width"), num(el, "height")];
      return [
        [x, y],
        [x + w, y + h],
        [x + w, y],
        [x, y + h],
      ];
    }
    case "circle": {
      const [cx, cy, r] = [num(el, "cx"), num(el, "cy"), num(el, "r")];
      return [
        [cx - r, cy - r],
        [cx + r, cy + r],
        [cx + r, cy - r],
        [cx - r, cy + r],
      ];
    }
    case "ellipse": {
      const [cx, cy, rx, ry] = [num(el, "cx"), num(el, "cy"), num(el, "rx"), num(el, "ry")];
      return [
        [cx - rx, cy - ry],
        [cx + rx, cy + ry],
        [cx + rx, cy - ry],
        [cx - rx, cy + ry],
      ];
    }
    case "line":
      return [
        [num(el, "x1"), num(el, "y1")],
        [num(el, "x2"), num(el, "y2")],
      ];
    case "polyline":
    case "polygon": {
      const n = numbers(el.getAttribute("points"));
      const pts: [number, number][] = [];
      for (let i = 0; i + 1 < n.length; i += 2) pts.push([n[i]!, n[i + 1]!]);
      return pts;
    }
    case "path":
      return pathPoints(el.getAttribute("d") ?? "");
    case "text":
      return [[num(el, "x"), num(el, "y")]];
    default:
      return [];
  }
}

// The end and control points of a path, in absolute coordinates.
export function pathPoints(d: string): [number, number][] {
  const tokens = d.match(/[a-zA-Z]|[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g) ?? [];
  const isCommand = (t: string | undefined) => t !== undefined && /^[a-zA-Z]$/.test(t);
  const points: [number, number][] = [];
  let i = 0;
  let [x, y] = [0, 0];
  let [startX, startY] = [0, 0];
  let command = "";

  const next = () => Number(tokens[i++]);
  // Arc flags may be written without separators ("a1 1 0 00 1 1"), so read them one digit at a time.
  const flag = () => {
    const token = tokens[i]!;
    if (token.length > 1) {
      tokens[i] = token.slice(1);
      return Number(token[0]);
    }
    i++;
    return Number(token);
  };

  while (i < tokens.length) {
    if (isCommand(tokens[i])) {
      command = tokens[i++]!;
      if (command === "Z" || command === "z") [x, y] = [startX, startY];
      continue;
    }
    // Each pass reads one segment's numbers. A number with no command before it is skipped.
    const rel = command === command.toLowerCase();
    const [ox, oy] = rel ? [x, y] : [0, 0];
    switch (command.toUpperCase()) {
      case "M":
        [x, y] = [ox + next(), oy + next()];
        [startX, startY] = [x, y];
        // Further pairs after a moveto are implicit linetos.
        command = rel ? "l" : "L";
        break;
      case "L":
      case "T":
        [x, y] = [ox + next(), oy + next()];
        break;
      case "H":
        x = ox + next();
        break;
      case "V":
        y = oy + next();
        break;
      case "C":
        points.push([ox + next(), oy + next()], [ox + next(), oy + next()]);
        [x, y] = [ox + next(), oy + next()];
        break;
      case "S":
      case "Q":
        points.push([ox + next(), oy + next()]);
        [x, y] = [ox + next(), oy + next()];
        break;
      case "A":
        next();
        next();
        next();
        flag();
        flag();
        [x, y] = [ox + next(), oy + next()];
        break;
      default:
        i++;
        continue;
    }
    points.push([x, y]);
  }
  // A truncated path reads past the end as NaN. Drop those points rather than the whole path.
  return points.filter(([px, py]) => Number.isFinite(px) && Number.isFinite(py));
}

function boxOf(points: [number, number][]): Box | null {
  if (points.length === 0) return null;
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

const corners = (b: Box): [number, number][] => [
  [b.x, b.y],
  [b.x + b.width, b.y],
  [b.x, b.y + b.height],
  [b.x + b.width, b.y + b.height],
];

// Text, titles and descriptions don't take up meaningful room in a floor plan's geometry.
const SKIP = new Set([
  "title",
  "desc",
  "metadata",
  "defs",
  "style",
  "script",
  "text",
  "clippath",
  "mask",
]);

// The element's box in the coordinate system that `ctm` maps into. `ctm` is the transform of the
// element's parent, and the element's own transform attribute is applied here.
function boundsWith(el: Element, ctm: Matrix): Box | null {
  const m = multiply(ctm, parseTransform(el.getAttribute("transform")));
  const tag = el.tagName.toLowerCase();
  if (tag === "g" || tag === "a" || tag === "svg" || tag === "switch") {
    const boxes = Array.from(el.children)
      .filter((c) => !SKIP.has(c.tagName.toLowerCase()))
      .map((c) => boundsWith(c, m))
      .filter((b): b is Box => b !== null);
    return boxOf(boxes.flatMap(corners));
  }
  return boxOf(localPoints(el).map(([x, y]) => apply(m, x, y)));
}

// The product of every ancestor's transform, up to but not including the root <svg>.
function ancestorMatrix(el: Element, root: Element): Matrix {
  const chain: Element[] = [];
  for (let p = el.parentElement; p && p !== root; p = p.parentElement) chain.unshift(p);
  return chain.reduce<Matrix>(
    (m, p) => multiply(m, parseTransform(p.getAttribute("transform"))),
    IDENTITY,
  );
}

// The element's bounding box in the root <svg>'s user units.
export function elementBounds(el: Element, root: Element): Box | null {
  return boundsWith(el, ancestorMatrix(el, root));
}

export function center(b: Box): [number, number] {
  return [b.x + b.width / 2, b.y + b.height / 2];
}

export function contains(b: Box, [x, y]: [number, number]): boolean {
  return x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height;
}
