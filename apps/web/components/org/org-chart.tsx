"use client";

import { useEffect, useRef, useState } from "react";
import type { OrgChart as OrgChartType } from "d3-org-chart";
import { escapeHtml } from "@officeorg/core/org/html";
import { initiallyVisible, nodesToReveal, type OrgNode } from "@officeorg/core/org/tree";

// d3-org-chart keeps its state as flags on the data objects themselves. `_expanded` makes a node
// visible (it opens the node's ancestors), and `_centered` asks the next draw to pan to it.
interface Datum extends OrgNode {
  selected: boolean;
  highlighted: boolean;
  _expanded?: boolean;
  _centered?: boolean;
}

interface Props {
  nodes: OrgNode[];
  // The node to center on, reveal with its direct reports, and mark as selected.
  selectedId: string | null;
  highlightedIds: ReadonlySet<string>;
  label: string;
  onSelect: (node: OrgNode) => void;
}

const NODE_WIDTH = 220;
const NODE_HEIGHT = 64;

// A client-only wrapper around d3-org-chart (plan.md §3). The library touches `window` when it's
// constructed, so it loads in an effect. React owns only the container; the chart owns the SVG
// inside it, and a change of selection flips flags on the same data array and redraws, so nodes
// the viewer opened or closed by hand stay that way.
export function OrgChart({ nodes, selectedId, highlightedIds, label, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<OrgChartType<Datum> | null>(null);
  const [ready, setReady] = useState(false);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  const drawn = useRef<DrawState>(emptyDrawState());

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    void import("d3-org-chart").then(({ OrgChart: Chart }) => {
      if (cancelled) return;
      const chart = new Chart<Datum>()
        .container(container as unknown as string)
        .svgHeight(container.clientHeight)
        .nodeId((d) => d.id)
        // Typed as data or hierarchy node, but stratify only ever passes the data. "" is a root.
        .parentNodeId((d) => (d as Datum).parentId ?? "")
        .nodeWidth(() => NODE_WIDTH)
        .nodeHeight(() => NODE_HEIGHT)
        .childrenMargin(() => 48)
        .compactMarginBetween(() => 24)
        .compactMarginPair(() => 48)
        .nodeButtonWidth(() => 36)
        .nodeButtonHeight(() => 22)
        .nodeButtonX(() => -18)
        .nodeButtonY(() => -11)
        // The default styling paints fixed colors. Nodes, links and buttons take theme slots
        // from the markup below and from globals.css instead.
        .nodeUpdate(() => {})
        .linkUpdate(() => {})
        .nodeContent((d) => nodeHtml(d.data))
        .buttonContent(({ node }) => buttonHtml(node.data, !!node.children))
        .onNodeClick((d) => onSelectRef.current(d.data));
      chartRef.current = chart;
      setReady(true);
    });
    return () => {
      cancelled = true;
      chartRef.current?.clear();
      chartRef.current = null;
      drawn.current = emptyDrawState();
      container.replaceChildren();
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!ready || !chart) return;
    if (nodes.length === 0) {
      chart.data([]).render();
      drawn.current = emptyDrawState();
      return;
    }

    const { data, fresh, centered, highlightMoved } = prepareDraw(
      drawn.current,
      nodes,
      selectedId,
      highlightedIds,
    );
    chart.data(data).render();

    // A centered node pans there by itself. Otherwise frame a new highlight, or a new tree.
    if (centered) return;
    const lit = chart
      .getChartState()
      .root.descendants()
      .filter((n) => n.data.highlighted);
    if (highlightMoved && lit.length > 0) chart.fit({ nodes: lit });
    else if (fresh) chart.fit();
  }, [ready, nodes, selectedId, highlightedIds]);

  return (
    <div className="relative">
      <div
        ref={containerRef}
        data-org-chart=""
        role="group"
        aria-label={label}
        className="h-[36rem] overflow-hidden rounded-lg border border-border bg-bg"
      />
      <div className="absolute right-2 top-2 flex gap-1">
        <ChartButton label="Zoom in" onClick={() => chartRef.current?.zoomIn()}>
          +
        </ChartButton>
        <ChartButton label="Zoom out" onClick={() => chartRef.current?.zoomOut()}>
          −
        </ChartButton>
        <ChartButton label="Fit to screen" onClick={() => chartRef.current?.fit()}>
          Fit
        </ChartButton>
      </div>
    </div>
  );
}

// What the last draw used, to tell a new tree from a new selection or highlight.
interface DrawState {
  nodes: OrgNode[] | null;
  // The array handed to the chart. The chart keeps state on these objects, so they live as long
  // as the tree does.
  data: Datum[];
  selectedId: string | null;
  highlightKey: string;
}

function emptyDrawState(): DrawState {
  return { nodes: null, data: [], selectedId: null, highlightKey: "" };
}

// Updates the chart's data in place for the next draw. A new tree starts from the initial
// expansion; otherwise the flags the viewer set by opening and closing nodes are kept.
function prepareDraw(
  state: DrawState,
  nodes: OrgNode[],
  selectedId: string | null,
  highlightedIds: ReadonlySet<string>,
): { data: Datum[]; fresh: boolean; centered: boolean; highlightMoved: boolean } {
  const fresh = state.nodes !== nodes;
  if (fresh) {
    const visible = initiallyVisible(nodes);
    state.nodes = nodes;
    state.data = nodes.map((n) => ({
      ...n,
      selected: false,
      highlighted: false,
      _expanded: visible.has(n.id),
    }));
    state.selectedId = null;
    state.highlightKey = "";
  }

  const reveal = nodesToReveal(nodes, selectedId, highlightedIds);
  for (const d of state.data) {
    d.selected = d.id === selectedId;
    d.highlighted = highlightedIds.has(d.id);
    if (reveal.has(d.id)) d._expanded = true;
  }

  // Only a change of selection pans the chart, so a highlight change doesn't yank it back.
  const target =
    selectedId !== null && selectedId !== state.selectedId
      ? state.data.find((d) => d.id === selectedId)
      : undefined;
  if (target) target._centered = true;
  const highlightKey = [...highlightedIds].sort().join(",");
  const highlightMoved = highlightKey !== state.highlightKey;
  state.selectedId = selectedId;
  state.highlightKey = highlightKey;

  return { data: state.data, fresh, centered: !!target, highlightMoved };
}

function ChartButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="min-w-8 rounded-md border border-border bg-card px-2 py-1 text-sm text-card-fg hover:bg-muted"
    >
      {children}
    </button>
  );
}

// Every value from the data is escaped: names and titles come from CSV imports and admin forms.
function nodeHtml(d: Datum): string {
  const tone =
    d.kind === "root"
      ? "bg-muted text-fg"
      : d.kind === "team"
        ? "bg-card text-card-fg border-l-4 border-l-primary"
        : "bg-card text-card-fg";
  const ring = d.selected
    ? "border-map-selection border-[3px]"
    : d.highlighted
      ? "border-map-highlight border-[3px]"
      : "border-border border";
  const detail = d.detail
    ? `<span class="truncate text-xs text-muted-fg">${escapeHtml(d.detail)}</span>`
    : "";
  return `<div data-org-node="${escapeHtml(d.id)}" data-kind="${d.kind}"${d.selected ? ' data-selected=""' : ""}${
    d.highlighted ? ' data-highlighted=""' : ""
  } class="flex h-full flex-col justify-center gap-0.5 rounded-md px-3 font-sans ${tone} ${ring}"><span class="truncate text-sm font-medium">${escapeHtml(
    d.label,
  )}</span>${detail}</div>`;
}

function buttonHtml(d: Datum & { _directSubordinatesPaging?: number }, open: boolean): string {
  const count = d._directSubordinatesPaging ?? 0;
  return `<div class="flex h-full items-center justify-center gap-1 rounded-full border border-border bg-card text-xs text-card-fg">${
    open ? "▴" : "▾"
  } ${count}</div>`;
}
