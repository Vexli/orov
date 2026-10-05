import type { ReactNode } from "react";

// A view's own controls (N4), in a full-width bar between the main menu and the content. On wide
// screens it sticks under the main menu, which is one 3.5rem row there (app layout).
export function ViewBar({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      role="region"
      aria-label={label}
      className="-mx-4 -mt-6 mb-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border bg-bg px-4 py-2 lg:sticky lg:top-14 lg:z-20"
    >
      {children}
    </div>
  );
}

// The selected person's card (N2), floating at the right of a full-width view on wide screens,
// below the main menu, and below the view's bar when it has one (`belowBar`), so no control is
// covered. Views that use it pad their content while it's open, so nothing is hidden under it.
// On narrow screens it follows the content.
export function FloatingPanel({ belowBar = false, children }: { belowBar?: boolean; children: ReactNode }) {
  const top = belowBar
    ? "lg:top-[8.5rem] lg:max-h-[calc(100vh-9.5rem)]"
    : "lg:top-[4.5rem] lg:max-h-[calc(100vh-5.5rem)]";
  return (
    <div
      className={`mt-6 space-y-3 lg:fixed lg:right-4 lg:z-20 lg:mt-0 lg:w-[22rem] lg:overflow-y-auto lg:rounded-lg lg:bg-bg lg:shadow-lg ${top}`}
    >
      {children}
    </div>
  );
}

// The room content leaves for the floating card on wide screens.
export const FLOATING_PANEL_GUTTER = "lg:pr-[23rem]";
