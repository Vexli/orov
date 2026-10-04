import { useMemo } from "react";
import { standsFor, type OrgNode } from "@officeorg/core/org/tree";

interface Props {
  nodes: OrgNode[];
  label: string;
  selectedId: string | null;
  highlightedIds: ReadonlySet<string>;
  onSelect: (node: OrgNode) => void;
}

// The same tree as the chart, as nested lists of buttons. The chart can't be used from a
// keyboard or a screen reader, so this is the accessible route (like the map's list, plan.md §6).
export function OrgOutline({ nodes, label, selectedId, highlightedIds, onSelect }: Props) {
  const children = useMemo(() => {
    const byParent = new Map<string | null, OrgNode[]>();
    for (const n of nodes) byParent.set(n.parentId, [...(byParent.get(n.parentId) ?? []), n]);
    return byParent;
  }, [nodes]);

  function branch(parentId: string | null, depth: number) {
    const items = children.get(parentId);
    if (!items) return null;
    return (
      <ul className={depth === 0 ? "space-y-1" : "mt-1 space-y-1 border-l border-border pl-4"}>
        {items.map((n) => {
          const selected = standsFor(n.id, selectedId);
          const highlighted = highlightedIds.has(n.id);
          return (
            <li key={n.id}>
              <button
                type="button"
                aria-current={selected ? "true" : undefined}
                onClick={() => onSelect(n)}
                className={`flex w-full flex-wrap items-baseline gap-x-2 rounded px-2 py-1 text-left text-sm ${
                  selected ? "bg-accent text-accent-fg" : "hover:bg-muted"
                }`}
              >
                <span className={n.kind === "person" ? "" : "font-medium"}>{n.label}</span>
                {n.detail ? <span className="text-xs text-muted-fg">{n.detail}</span> : null}
                {highlighted ? (
                  <span className="rounded bg-map-highlight px-1.5 text-xs text-bg">In team</span>
                ) : null}
              </button>
              {branch(n.id, depth + 1)}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <nav aria-label={label} className="rounded-lg border border-border p-3">
      {nodes.length === 0 ? (
        <p className="p-2 text-sm text-muted-fg">Nothing to show.</p>
      ) : (
        branch(null, 0)
      )}
    </nav>
  );
}
