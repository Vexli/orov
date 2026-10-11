// Floor drawings for the demo organization, generated to the conventions in
// docs/map-authoring.md: two areas of desks side by side on the left, and a column of rooms and
// points of interest on the right. The builder stores them through the sanitizer and reads their
// desks, rooms and areas back with the upload parser, so the demo's rows are exactly what an
// admin uploading these drawings would get.

export interface FloorPlan {
  // The floor's slug, which every desk id carries ("desk-4-001" on floor "4").
  floorSlug: string;
  // Two areas, each a grid of desks numbered on from the previous area's.
  areas: [AreaPlan, AreaPlan];
  // Meeting rooms and phone booths ("room-…" slugs) down the right-hand column, then points of
  // interest ("poi-…").
  rooms: string[];
  pois: string[];
}

export interface AreaPlan {
  slug: string;
  desks: number;
}

const WIDTH = 1200;
const HEIGHT = 800;
const MARGIN = 20;
// The desk area is the left 62% of the floor, split between the two areas.
const AREA_RIGHT = 760;
const DESK = { width: 84, height: 52, gapX: 22 };
const COLUMNS = 3;

const rect = (attrs: Record<string, string | number>) =>
  `<rect ${Object.entries(attrs)
    .map(([k, v]) => `${k}="${v}"`)
    .join(" ")}/>`;

export function drawFloor(plan: FloorPlan): string {
  const parts: string[] = [
    // Outer wall and the wall between the desks and the rooms: decoration in currentColor.
    rect({
      x: MARGIN,
      y: MARGIN,
      width: WIDTH - 2 * MARGIN,
      height: HEIGHT - 2 * MARGIN,
      rx: 8,
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 4,
    }),
    `<path d="M${AREA_RIGHT} ${MARGIN}V${HEIGHT - MARGIN}M${AREA_RIGHT / 2 + MARGIN / 2} ${MARGIN}V${HEIGHT - MARGIN}" fill="none" stroke="currentColor" stroke-width="2"/>`,
  ];

  let deskNumber = 1;
  const areaWidth = (AREA_RIGHT - MARGIN) / 2;
  plan.areas.forEach((area, i) => {
    const x0 = MARGIN + i * areaWidth;
    const desks: string[] = [];
    // Rows spread down the area's height, at most 150 apart.
    const rows = Math.ceil(area.desks / COLUMNS);
    const rowPitch = Math.min(150, (HEIGHT - 2 * MARGIN - 100) / rows);
    for (let d = 0; d < area.desks; d++, deskNumber++) {
      const col = d % COLUMNS;
      const row = Math.floor(d / COLUMNS);
      const id = `desk-${plan.floorSlug}-${String(deskNumber).padStart(3, "0")}`;
      desks.push(
        rect({
          id,
          x: x0 + 34 + col * (DESK.width + DESK.gapX),
          y: MARGIN + 50 + row * rowPitch,
          width: DESK.width,
          height: DESK.height,
          rx: 4,
        }),
      );
    }
    parts.push(
      `<g id="area-${area.slug}">${rect({ x: x0 + 10, y: MARGIN + 10, width: areaWidth - 20, height: HEIGHT - 2 * MARGIN - 20, fill: "none" })}${desks.join("")}</g>`,
    );
  });

  // The right-hand column: rooms stacked, then points of interest side by side at the bottom.
  const colX = AREA_RIGHT + 30;
  const colWidth = WIDTH - MARGIN - 30 - colX;
  const roomHeight = Math.min(
    150,
    (HEIGHT - 2 * MARGIN - 180) / Math.max(plan.rooms.length, 1) - 20,
  );
  plan.rooms.forEach((slug, i) => {
    const phone = slug.startsWith("phone-");
    parts.push(
      rect({
        id: `room-${slug}`,
        x: colX,
        y: MARGIN + 30 + i * (roomHeight + 20),
        width: phone ? colWidth / 2 : colWidth,
        height: roomHeight,
        rx: 4,
      }),
    );
  });
  const poiWidth = (colWidth - 20 * (plan.pois.length - 1)) / Math.max(plan.pois.length, 1);
  plan.pois.forEach((kind, i) => {
    parts.push(
      rect({
        id: `poi-${kind}`,
        x: colX + i * (poiWidth + 20),
        y: HEIGHT - MARGIN - 150,
        width: poiWidth,
        height: 120,
        rx: 4,
      }),
    );
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}">${parts.join("")}</svg>`;
}
