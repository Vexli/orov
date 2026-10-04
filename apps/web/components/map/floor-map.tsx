"use client";

import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { labelLayout, type LabelKind } from "@officeorg/core/map/labels";
import { ROOM_STATE_LABEL, type RoomDisplayState } from "@officeorg/core/map/room-status";
import {
  TransformComponent,
  TransformWrapper,
  useControls,
  type ReactZoomPanPinchContentRef,
} from "react-zoom-pan-pinch";

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Avatar {
  svgElementId: string;
  initials: string;
  name: string;
  emphasis: "selected" | "highlighted" | null;
  // Outside the area being viewed.
  dimmed: boolean;
}

// A room's, point of interest's or area's name, drawn by the app from the database (#26).
export interface MapLabel {
  svgElementId: string;
  name: string;
  kind: LabelKind;
  dimmed: boolean;
}

export interface RoomCue {
  svgElementId: string;
  name: string;
  state: RoomDisplayState;
  dimmed: boolean;
}

interface Props {
  // Changes with every drawing version. Measurements are cached per asset.
  assetId: string;
  svg: string;
  // The generated state <style> block (packages/core/map/state-css.ts).
  stateCss: string;
  avatars: Avatar[];
  // A room's status as a shape as well as a fill color, so it never depends on hue (plan.md §6).
  roomCues?: RoomCue[];
  labels?: MapLabel[];
  label: string;
  onSelect: (svgElementId: string) => void;
  // The svg id of the area to zoom to (U6). Everything outside it is dimmed.
  focusAreaId: string | null;
}

// The drawing is injected once per asset and never re-rendered: React doesn't own its nodes, so
// a change of selection only rewrites the small <style> block next to it (plan.md §6).
export const Drawing = memo(
  function Drawing({ svg }: { svg: string }) {
    return <div dangerouslySetInnerHTML={{ __html: svg }} />;
  },
  (a, b) => a.svg === b.svg,
);

// Desk, room, point of interest and area boxes in drawing units, measured once per asset version after the first paint.
const boxCache = new Map<string, Map<string, Box>>();

function measure(root: SVGSVGElement): Map<string, Box> {
  const boxes = new Map<string, Box>();
  const rootInverse = root.getScreenCTM()?.inverse();
  if (!rootInverse) return boxes;
  for (const el of root.querySelectorAll<SVGGraphicsElement>(MEASURED)) {
    const ctm = el.getScreenCTM();
    if (!ctm) continue;
    // getBBox is in the element's own units. Mapping its corners through the screen matrices
    // gives drawing units, whatever transforms the designer nested it in, and whatever the
    // current zoom is (it cancels out).
    const m = rootInverse.multiply(ctm);
    const b = el.getBBox();
    const corners = [
      new DOMPoint(b.x, b.y),
      new DOMPoint(b.x + b.width, b.y),
      new DOMPoint(b.x, b.y + b.height),
      new DOMPoint(b.x + b.width, b.y + b.height),
    ].map((p) => p.matrixTransform(m));
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    boxes.set(el.id, {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    });
  }
  return boxes;
}

const MEASURED = '[id^="desk-"], [id^="room-"], [id^="poi-"], [id^="area-"]';
const CLICKABLE = '[id^="desk-"], [id^="room-"]';
const NOT_DRAWN = new Set(["defs", "style", "title", "desc", "metadata"]);
// A pointer that moves further than this between down and up was a pan, not a click.
const CLICK_SLOP = 5;

export function FloorMap({
  assetId,
  svg,
  stateCss,
  avatars,
  roomCues = [],
  labels = [],
  label,
  onSelect,
  focusAreaId,
}: Props) {
  const drawingRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<ReactZoomPanPinchContentRef>(null);
  const pointerDown = useRef<{ x: number; y: number } | null>(null);
  const [measured, setMeasured] = useState<{
    assetId: string;
    viewBox: string;
    boxes: Map<string, Box>;
  } | null>(null);

  // Measures before paint, so avatars don't jump into place. The cache keeps a floor switch and
  // back instant.
  useLayoutEffect(() => {
    const root = drawingRef.current?.querySelector("svg");
    if (!root) return;
    let boxes = boxCache.get(assetId);
    if (!boxes) {
      boxes = measure(root);
      boxCache.set(assetId, boxes);
    }
    const vb = root.viewBox.baseVal;
    setMeasured({ assetId, viewBox: `${vb.x} ${vb.y} ${vb.width} ${vb.height}`, boxes });
  }, [assetId]);

  const current = measured?.assetId === assetId ? measured : null;

  // Area view: dim every element that isn't the area or one of its ancestors, then zoom to it.
  // Marking siblings along the path, rather than everything outside the area, keeps the area's
  // own labels and outline at full strength.
  useEffect(() => {
    const root = drawingRef.current?.querySelector("svg");
    if (!root || !current) return;
    for (const el of root.querySelectorAll("[data-dim]")) el.removeAttribute("data-dim");

    const zoom = zoomRef.current;
    const area = focusAreaId ? root.querySelector(`#${CSS.escape(focusAreaId)}`) : null;
    if (!area) {
      // Animated on purpose: the library only cancels a running animation when it starts a new
      // one, so an instant reset during the zoom-to-area animation would be overwritten by it.
      void zoom?.resetTransform(200);
      return;
    }
    for (let node: Element = area; node !== root && node.parentElement; node = node.parentElement) {
      for (const sibling of node.parentElement.children) {
        if (sibling !== node && !NOT_DRAWN.has(sibling.tagName.toLowerCase())) {
          sibling.setAttribute("data-dim", "");
        }
      }
    }
    // The library measures with getBoundingClientRect, which SVG elements have too. A frame's
    // delay lets it see the drawing's laid-out size on first load.
    const frame = requestAnimationFrame(() => {
      void zoom?.zoomToElement(area as unknown as HTMLElement, { maxScale: 4, animationTime: 300 });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusAreaId, current]);

  function handleClick(e: React.MouseEvent) {
    const start = pointerDown.current;
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > CLICK_SLOP) return;
    const target = (e.target as Element).closest(CLICKABLE);
    if (target && drawingRef.current?.contains(target)) onSelect(target.id);
  }

  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-map-bg">
      <TransformWrapper
        ref={zoomRef}
        minScale={1}
        maxScale={8}
        limitToBounds
        doubleClick={{ mode: "zoomIn", step: 0.7 }}
        wheel={{ step: 0.15 }}
      >
        <TransformComponent wrapperClass="w-full!" contentClass="w-full!">
          <div
            role="img"
            aria-label={label}
            data-floor-map=""
            className="relative w-full"
            onPointerDown={(e) => (pointerDown.current = { x: e.clientX, y: e.clientY })}
            onClick={handleClick}
          >
            <style>{stateCss}</style>
            <div ref={drawingRef} key={assetId}>
              <Drawing svg={svg} />
            </div>
            {current ? (
              <svg
                viewBox={current.viewBox}
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 h-full w-full"
              >
                {/* Names first, so avatars and status cues sit on top. */}
                {labels.map((l) => {
                  const box = current.boxes.get(l.svgElementId);
                  return box ? <NameLabel key={l.svgElementId} label={l} box={box} /> : null;
                })}
                {avatars.map((a) => {
                  const box = current.boxes.get(a.svgElementId);
                  if (!box) return null;
                  const r = Math.max(6, Math.min(box.width, box.height) * 0.38);
                  return (
                    <g
                      key={a.svgElementId}
                      data-avatar={a.svgElementId}
                      style={a.dimmed ? { opacity: "var(--map-dim-opacity)" } : undefined}
                      transform={`translate(${box.x + box.width / 2} ${box.y + box.height / 2})`}
                    >
                      <title>{a.name}</title>
                      <circle
                        r={r}
                        className={
                          a.emphasis === "selected"
                            ? "fill-primary stroke-bg"
                            : a.emphasis === "highlighted"
                              ? "fill-map-highlight stroke-bg"
                              : "fill-muted stroke-border"
                        }
                        strokeWidth={2}
                      />
                      <text
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={r * 0.85}
                        fontWeight={600}
                        className={
                          a.emphasis === "selected"
                            ? "fill-primary-fg"
                            : a.emphasis === "highlighted"
                              ? "fill-bg"
                              : "fill-fg"
                        }
                      >
                        {a.initials}
                      </text>
                    </g>
                  );
                })}
                {roomCues.map((cue) => {
                  const box = current.boxes.get(cue.svgElementId);
                  return box ? <RoomStatusCue key={cue.svgElementId} cue={cue} box={box} /> : null;
                })}
              </svg>
            ) : null}
          </div>
        </TransformComponent>
        <ZoomControls />
      </TransformWrapper>
    </div>
  );
}

// Drawn in the text colour with a halo in the card colour, so a name stays readable on a selected
// or status-tinted room, in light and dark themes alike.
function NameLabel({ label, box }: { label: MapLabel; box: Box }) {
  const layout = labelLayout(box, label.name, label.kind);
  if (!layout) return null;
  return (
    <text
      data-label={label.svgElementId}
      x={layout.x}
      y={layout.y}
      textAnchor={layout.anchor}
      dominantBaseline={label.kind === "room" ? "central" : "auto"}
      fontSize={layout.fontSize}
      fontWeight={label.kind === "area" ? 600 : 500}
      className={`${label.kind === "area" ? "fill-muted-fg" : "fill-fg"} stroke-card`}
      strokeWidth={layout.fontSize * 0.22}
      strokeLinejoin="round"
      paintOrder="stroke"
      style={label.dimmed ? { opacity: "var(--map-dim-opacity)" } : undefined}
    >
      {layout.truncated ? <title>{label.name}</title> : null}
      {layout.text}
    </text>
  );
}

function ZoomControls() {
  const { zoomIn, zoomOut, resetTransform } = useControls();
  const button =
    "flex h-8 min-w-8 items-center justify-center rounded-md border border-border bg-card px-2 text-sm text-card-fg";
  return (
    <div className="absolute right-2 top-2 flex gap-1">
      <button type="button" className={button} onClick={() => zoomIn()} aria-label="Zoom in">
        +
      </button>
      <button type="button" className={button} onClick={() => zoomOut()} aria-label="Zoom out">
        −
      </button>
      <button type="button" className={button} onClick={() => resetTransform()}>
        Reset
      </button>
    </div>
  );
}

// Class names are spelled out so Tailwind finds them; each reads a room.* theme slot.
const CUE_STROKE: Record<RoomDisplayState, string> = {
  free: "stroke-room-free",
  busy: "stroke-room-busy",
  soon: "stroke-room-soon",
  stale: "stroke-room-stale",
};

// Icon paths on a unit circle: a tick, a no-entry bar, clock hands. Stale is a dashed ring
// with a question mark.
const CUE_PATH: Record<Exclude<RoomDisplayState, "stale">, string> = {
  free: "M-0.45 0.02 L-0.12 0.35 L0.48 -0.3",
  busy: "M-0.5 0 L0.5 0",
  soon: "M0 -0.55 L0 0 L0.38 0.22",
};

function RoomStatusCue({ cue, box }: { cue: RoomCue; box: Box }) {
  const r = Math.max(6, Math.min(14, Math.min(box.width, box.height) * 0.18));
  const pad = r * 0.4;
  return (
    <g
      data-room-state={cue.state}
      data-room={cue.svgElementId}
      style={cue.dimmed ? { opacity: "var(--map-dim-opacity)" } : undefined}
      transform={`translate(${box.x + box.width - r - pad} ${box.y + r + pad}) scale(${r})`}
    >
      <title>{`${cue.name}: ${ROOM_STATE_LABEL[cue.state]}`}</title>
      <circle
        r={1}
        className={`fill-card ${CUE_STROKE[cue.state]}`}
        strokeWidth={0.22}
        strokeDasharray={cue.state === "stale" ? "0.5 0.35" : undefined}
      />
      {cue.state === "stale" ? (
        <text
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={1.2}
          fontWeight={700}
          className="fill-room-stale"
        >
          ?
        </text>
      ) : (
        <path
          d={CUE_PATH[cue.state]}
          className={CUE_STROKE[cue.state]}
          fill="none"
          strokeWidth={0.26}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </g>
  );
}
