"use client";

import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
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

interface Props {
  // Changes with every drawing version. Measurements are cached per asset.
  assetId: string;
  svg: string;
  // The generated state <style> block (packages/core/map/state-css.ts).
  stateCss: string;
  avatars: Avatar[];
  label: string;
  onSelect: (svgElementId: string) => void;
  // The svg id of the area to zoom to (U6). Everything outside it is dimmed.
  focusAreaId: string | null;
}

// The drawing is injected once per asset and never re-rendered: React doesn't own its nodes, so
// a change of selection only rewrites the small <style> block next to it (plan.md §6).
const Drawing = memo(
  function Drawing({ svg }: { svg: string }) {
    return <div dangerouslySetInnerHTML={{ __html: svg }} />;
  },
  (a, b) => a.svg === b.svg,
);

// Desk and room boxes in drawing units, measured once per asset version after the first paint.
const boxCache = new Map<string, Map<string, Box>>();

function measure(root: SVGSVGElement): Map<string, Box> {
  const boxes = new Map<string, Box>();
  const rootInverse = root.getScreenCTM()?.inverse();
  if (!rootInverse) return boxes;
  for (const el of root.querySelectorAll<SVGGraphicsElement>('[id^="desk-"], [id^="room-"]')) {
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

const CLICKABLE = '[id^="desk-"], [id^="room-"]';
const NOT_DRAWN = new Set(["defs", "style", "title", "desc", "metadata"]);
// A pointer that moves further than this between down and up was a pan, not a click.
const CLICK_SLOP = 5;

export function FloorMap({ assetId, svg, stateCss, avatars, label, onSelect, focusAreaId }: Props) {
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
      zoom?.resetTransform(0);
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
              </svg>
            ) : null}
          </div>
        </TransformComponent>
        <ZoomControls />
      </TransformWrapper>
    </div>
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
