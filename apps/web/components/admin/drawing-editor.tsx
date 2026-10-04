"use client";

import { useRef, useState } from "react";
import type { DrawingEditInput } from "@officeorg/core/svg/edit-input";
import { Drawing } from "@/components/map/floor-map";

type Tool = "desk" | "room" | "remove";

interface Props {
  // The sanitized drawing being edited: the current version, or the edits made so far.
  svg: string;
  busy: boolean;
  onEdit: (edit: DrawingEditInput) => void;
}

// The drawing, as a canvas for placing desks, drawing rooms and removing either (#21). Each
// gesture becomes one edit; the panel previews it like an upload, so nothing is saved until the
// admin applies the result.
export function DrawingEditor({ svg, busy, onEdit }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<Tool>("desk");
  const [roomName, setRoomName] = useState("");
  const start = useRef<{ x: number; y: number } | null>(null);

  // Screen position → drawing units, through the drawing's own transform.
  function toDrawing(clientX: number, clientY: number) {
    const root = box.current?.querySelector("svg");
    const matrix = root?.getScreenCTM()?.inverse();
    if (!root || !matrix) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(matrix);
    return { x: p.x, y: p.y, root };
  }

  // New desks take the size most desks on the floor have, so they line up with the rest.
  function deskSize(root: SVGSVGElement) {
    const sizes = Array.from(root.querySelectorAll<SVGGraphicsElement>('[id^="desk-"]'), (el) => {
      const b = el.getBBox();
      return `${Math.round(b.width)}x${Math.round(b.height)}`;
    });
    const counts = new Map<string, number>();
    for (const size of sizes) counts.set(size, (counts.get(size) ?? 0) + 1);
    const common = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
    const [width, height] = (common ?? "90x56").split("x").map(Number) as [number, number];
    return { width, height };
  }

  function down(e: React.PointerEvent) {
    const p = toDrawing(e.clientX, e.clientY);
    if (p) start.current = { x: p.x, y: p.y };
  }

  function up(e: React.PointerEvent) {
    const from = start.current;
    start.current = null;
    const p = toDrawing(e.clientX, e.clientY);
    if (!from || !p || busy) return;
    if (tool === "remove") {
      const target = (e.target as Element).closest('[id^="desk-"], [id^="room-"]');
      if (target) onEdit({ kind: "remove", svgElementId: target.id });
    } else if (tool === "desk") {
      const { width, height } = deskSize(p.root);
      onEdit({ kind: "addDesk", rect: { x: p.x - width / 2, y: p.y - height / 2, width, height } });
    } else if (roomName.trim()) {
      onEdit({
        kind: "addRoom",
        name: roomName,
        rect: {
          x: Math.min(from.x, p.x),
          y: Math.min(from.y, p.y),
          width: Math.abs(p.x - from.x),
          height: Math.abs(p.y - from.y),
        },
      });
    }
  }

  const hint =
    tool === "desk"
      ? "Click where the new desk goes."
      : tool === "room"
        ? roomName.trim()
          ? "Drag across the drawing to draw the room."
          : "Name the room, then drag across the drawing to draw it."
        : "Click a desk or room to remove it.";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <fieldset className="flex gap-3">
          <legend className="sr-only">Tool</legend>
          {(
            [
              ["desk", "Add a desk"],
              ["room", "Draw a room"],
              ["remove", "Remove"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex items-center gap-1.5">
              <input
                type="radio"
                name="drawing-tool"
                checked={tool === value}
                onChange={() => setTool(value)}
              />
              {label}
            </label>
          ))}
        </fieldset>
        {tool === "room" ? (
          <label className="flex items-center gap-2">
            Room name
            <input
              className="rounded-md border border-border bg-transparent px-2 py-1 text-sm"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
            />
          </label>
        ) : null}
      </div>
      <p className="mt-2 text-xs text-muted-fg" aria-live="polite">
        {hint}
      </p>
      <div
        ref={box}
        data-floor-map=""
        data-drawing-editor=""
        onPointerDown={down}
        onPointerUp={up}
        className="mt-2 cursor-crosshair touch-none select-none rounded-md border border-border bg-map-bg"
      >
        <Drawing svg={svg} />
      </div>
    </div>
  );
}
