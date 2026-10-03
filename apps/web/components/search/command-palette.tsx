"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { EMPTY_SEARCH, type SearchResults } from "@officeorg/core/search/model";
import { isViewPath } from "@/components/view-tabs";

interface Option {
  key: string;
  group: "People" | "Teams" | "Rooms";
  label: string;
  detail: string | null;
  href: string;
}

const ROOM_KIND = { meeting_room: "Meeting room", phone_booth: "Phone booth" } as const;

// Global search (⌘K, plan.md §7). A person or team becomes the selection in the current view,
// so the search works from any of the three; a room opens on its floor in the map.
export function CommandPalette() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY_SEARCH);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [active, setActive] = useState(0);

  function open() {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        open();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Debounced, and a newer query cancels the request for an older one.
  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Search failed: ${res.status}`);
        setResults((await res.json()) as SearchResults);
        setStatus("done");
        setActive(0);
      } catch {
        if (!controller.signal.aborted) setStatus("error");
      }
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const options = useMemo<Option[]>(() => {
    // A person or team keeps the current view and its other params. A room on the map replaces
    // a selected person, as clicking it on the map does.
    const view = isViewPath(pathname) ? pathname : "/directory";
    const withParams = (path: string, set: Record<string, string>, drop: string[]) => {
      const params = new URLSearchParams(path === pathname ? searchParams.toString() : "");
      for (const key of drop) params.delete(key);
      for (const [key, value] of Object.entries(set)) params.set(key, value);
      return `${path}?${params.toString()}`;
    };
    const keepSelection = () => {
      const params = new URLSearchParams();
      for (const key of ["team", "sub"]) {
        const value = searchParams.get(key);
        if (value) params.set(key, value);
      }
      return params;
    };
    return [
      ...results.people.map<Option>((p) => ({
        key: `person:${p.id}`,
        group: "People",
        label: p.name,
        detail: [p.title, p.desk].filter(Boolean).join(" · ") || null,
        href: withParams(view, { person: p.id }, ["space"]),
      })),
      ...results.teams.map<Option>((t) => ({
        key: `team:${t.id}`,
        group: "Teams",
        label: t.name,
        detail: t.parentName ? `Team in ${t.parentName}` : "Team",
        href: withParams(view, { team: t.id }, []),
      })),
      ...results.rooms.map<Option>((r) => {
        const params = keepSelection();
        params.set("loc", r.locationSlug);
        params.set("floor", r.floorSlug);
        params.set("space", r.id);
        return {
          key: `room:${r.id}`,
          group: "Rooms",
          label: r.name,
          detail: `${ROOM_KIND[r.kind]} · ${r.locationName}, ${r.floorName}`,
          href: `/map?${params.toString()}`,
        };
      }),
    ];
  }, [results, pathname, searchParams]);

  function pick(option: Option) {
    dialogRef.current?.close();
    router.push(option.href);
  }

  function reset() {
    setQuery("");
    setResults(EMPTY_SEARCH);
    setStatus("idle");
    setActive(0);
  }

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (options.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % options.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + options.length) % options.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const option = options[active];
      if (option) pick(option);
    }
  }

  const groups = (["People", "Teams", "Rooms"] as const)
    .map((group) => ({ group, items: options.filter((o) => o.group === group) }))
    .filter((g) => g.items.length > 0);
  const activeOption = options[active];
  const showResults = query.trim() !== "" && status !== "idle";

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-keyshortcuts="Meta+K Control+K"
        className="flex items-center gap-3 rounded-md border border-border px-3 py-1 text-sm text-muted-fg hover:text-fg"
      >
        Search
        <kbd className="rounded bg-muted px-1.5 font-sans text-xs">⌘K</kbd>
      </button>
      <dialog
        ref={dialogRef}
        aria-label="Search"
        onClose={reset}
        onClick={(e) => {
          // A click on the backdrop lands on the dialog element itself.
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
        className="mx-auto mt-[12vh] w-[min(36rem,calc(100vw-2rem))] rounded-lg border border-border bg-card p-0 text-card-fg backdrop:bg-fg/30"
      >
        <div className="p-3">
          <input
            type="text"
            role="combobox"
            aria-label="Search people, teams and rooms"
            aria-expanded={showResults && options.length > 0}
            aria-controls="search-results"
            aria-autocomplete="list"
            aria-activedescendant={activeOption ? `search-${activeOption.key}` : undefined}
            placeholder="Search people, teams and rooms"
            autoComplete="off"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (e.target.value.trim()) setStatus("loading");
              else reset();
            }}
            onKeyDown={onInputKey}
            className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
          />
        </div>
        <div className="max-h-[50vh] overflow-y-auto border-t border-border px-2 pb-2">
          <ul id="search-results" role="listbox" aria-label="Results">
            {groups.map(({ group, items }) => (
              <li key={group} role="presentation">
                <p
                  aria-hidden="true"
                  className="px-2 pb-1 pt-3 text-xs uppercase tracking-wide text-muted-fg"
                >
                  {group}
                </p>
                <ul role="group" aria-label={group}>
                  {items.map((o) => {
                    const isActive = o.key === activeOption?.key;
                    return (
                      <li
                        key={o.key}
                        id={`search-${o.key}`}
                        role="option"
                        aria-selected={isActive}
                        onClick={() => pick(o)}
                        onMouseMove={() => setActive(options.indexOf(o))}
                        className={`cursor-pointer rounded px-2 py-1.5 text-sm ${
                          isActive ? "bg-accent text-accent-fg" : ""
                        }`}
                      >
                        <span className="block">{o.label}</span>
                        {o.detail ? (
                          <span className="block text-xs text-muted-fg">{o.detail}</span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
          <p role="status" className="px-2 pt-3 text-sm text-muted-fg empty:hidden">
            {query.trim() === ""
              ? "Type a name, title, team or room."
              : status === "error"
                ? "Search isn't available right now."
                : status === "done" && options.length === 0
                  ? "No matches."
                  : ""}
          </p>
        </div>
      </dialog>
    </>
  );
}
