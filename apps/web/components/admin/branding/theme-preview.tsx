"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ThemeValues } from "@officeorg/core/theme/values";

// A live preview of the draft theme in the real directory, map and org chart (plan.md §9.1,
// step 5). The views load in a same-origin iframe, and the draft CSS is added to the frame's
// document as a constructed stylesheet. Constructed sheets come after the page's own, so the
// draft wins over the active /theme.css without anything being saved.

const VIEWS = [
  { path: "/directory", label: "Directory" },
  { path: "/map", label: "Map" },
  { path: "/org", label: "Org chart" },
] as const;

// One sheet per document. Navigating the frame from its initial about:blank to a same-origin
// page keeps the same Window but makes a new Document, and a constructed sheet can only be
// adopted by documents of the window that made it.
const sheets = new WeakMap<Document, CSSStyleSheet>();

function inject(frame: HTMLIFrameElement | null, css: string) {
  const win = frame?.contentWindow as (Window & typeof globalThis) | null | undefined;
  const doc = frame?.contentDocument;
  if (!win || !doc || doc.URL === "about:blank") return;
  let sheet = sheets.get(doc);
  if (!sheet) {
    sheet = new win.CSSStyleSheet();
    sheets.set(doc, sheet);
    doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
  }
  sheet.replaceSync(css);
}

export function ThemePreview({ css, values }: { css: string; values: ThemeValues }) {
  const [view, setView] = useState<(typeof VIEWS)[number]>(VIEWS[0]);
  const frame = useRef<HTMLIFrameElement>(null);
  const latest = useRef(css);

  useEffect(() => {
    latest.current = css;
    inject(frame.current, css);
  }, [css]);
  // Each navigation inside the frame is a new document, which needs the sheet again.
  const onLoad = useCallback(() => inject(frame.current, latest.current), []);

  const logo = values.light["logo.light"] || values.light["logo.dark"];

  return (
    <section aria-labelledby="preview-heading" className="space-y-3">
      <div className="flex flex-wrap items-center gap-4">
        <h2 id="preview-heading" className="font-heading">
          Preview
        </h2>
        <div role="tablist" aria-label="Preview view" className="flex gap-1 text-sm">
          {VIEWS.map((v) => (
            <button
              key={v.path}
              type="button"
              role="tab"
              aria-selected={v.path === view.path}
              onClick={() => setView(v)}
              className={`rounded-md px-3 py-1 ${
                v.path === view.path ? "bg-primary text-primary-fg" : "border border-border"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
        <span className="ml-auto flex items-center gap-2 text-sm text-muted-fg">
          Header:
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/brand-assets/${logo}`}
              alt={values.light["appName"]}
              className="h-6 w-auto"
            />
          ) : (
            <span className="font-semibold text-fg">{values.light["appName"]}</span>
          )}
        </span>
      </div>
      <p className="text-xs text-muted-fg">
        Colors, fonts and density are previewed below. The views&apos; own header still shows the
        current name and logo until you apply.
      </p>
      <iframe
        ref={frame}
        key={view.path}
        src={view.path}
        title={`Preview of the ${view.label.toLowerCase()}`}
        onLoad={onLoad}
        className="h-[36rem] w-full rounded-lg border border-border bg-bg"
      />
    </section>
  );
}
