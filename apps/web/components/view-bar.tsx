import type { ReactNode } from "react";

// A view's own controls (N4), in a full-width bar between the main menu and the content. On wide
// screens it sticks to the top of <main>, the app layout's scrolling area, right under the menu.
// A sticky offset counts from inside <main>'s padding, so -top-6 cancels its 1.5rem top padding.
export function ViewBar({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      role="region"
      aria-label={label}
      className="-mx-4 -mt-6 mb-6 flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2 border-b border-border bg-bg px-4 py-2 lg:sticky lg:-top-6 lg:z-20"
    >
      {children}
    </div>
  );
}

// The selected person's card (N2), floating at the right of a full-width view on wide screens,
// below the main menu, and below the view's bar when it has one (`belowBar`), so no control is
// covered. Views that use it pad their content while it's open, so nothing is hidden under it.
// On narrow screens it's a sheet along the bottom of the screen (Phase 6), so a tap on a row or a
// desk shows the card where the viewer is looking, rather than below the content; it sits above
// the full-screen map too.
export function FloatingPanel({
  belowBar = false,
  children,
}: {
  belowBar?: boolean;
  children: ReactNode;
}) {
  const top = belowBar
    ? "lg:top-[8.5rem] lg:max-h-[calc(100vh-9.5rem)]"
    : "lg:top-[4.5rem] lg:max-h-[calc(100vh-5.5rem)]";
  return (
    <div
      data-sheet=""
      className={`fixed inset-x-0 bottom-0 z-50 max-h-[45dvh] space-y-3 overflow-y-auto rounded-t-xl border-t border-border bg-bg p-3 shadow-lg lg:inset-x-auto lg:bottom-auto lg:right-4 lg:z-20 lg:rounded-lg lg:border-0 lg:p-0 lg:w-[22rem] ${top}`}
    >
      {children}
    </div>
  );
}

// The room content leaves for the floating card: at the right on wide screens, and at the bottom
// on narrow ones, so the last rows can still be scrolled clear of the sheet.
export const FLOATING_PANEL_GUTTER = "pb-[45dvh] lg:pb-0 lg:pr-[23rem]";
