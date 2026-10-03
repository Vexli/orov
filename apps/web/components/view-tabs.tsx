"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createSerializer, useQueryStates } from "nuqs";
import { selectionParsers } from "@/lib/url-state";

export const VIEWS = [
  { href: "/directory", label: "Directory" },
  { href: "/map", label: "Map" },
  { href: "/org", label: "Org chart" },
] as const;

export function isViewPath(pathname: string): boolean {
  return VIEWS.some((v) => pathname === v.href || pathname.startsWith(`${v.href}/`));
}

const serializeSelection = createSerializer(selectionParsers);

// The view tabs in the shell. Each link carries the selection (person, team and sub-teams) and
// nothing else, so switching views keeps who or what is selected (U9). View-only params such as
// the map's floor or the directory's filters stay behind: carried over, a directory location
// filter could hide the very person being followed.
export function ViewTabs() {
  const pathname = usePathname();
  const [selection] = useQueryStates(selectionParsers);
  return (
    <nav aria-label="Views" className="flex gap-4 text-sm">
      {VIEWS.map((view) => {
        const active = pathname === view.href || pathname.startsWith(`${view.href}/`);
        return (
          <Link
            key={view.href}
            href={serializeSelection(view.href, selection)}
            aria-current={active ? "page" : undefined}
            className={
              active ? "font-medium underline underline-offset-4" : "text-muted-fg hover:text-fg"
            }
          >
            {view.label}
          </Link>
        );
      })}
    </nav>
  );
}
