"use client";

import type { ContrastCheck } from "@orov/core/theme/contrast";
import type { ThemeMode } from "@orov/core/theme/values";

// The contrast report (plan.md §9.1, step 3). Failures come first, each with the nearest shade
// of the same hue that passes; one click maps the slot to it.

interface Props {
  checks: ContrastCheck[];
  onUseShade: (slot: string, mode: ThemeMode, hex: string) => void;
}

const DEFICIENCY: Record<string, string> = {
  protanopia: "protanopia (red-blind)",
  deuteranopia: "deuteranopia (green-blind)",
  tritanopia: "tritanopia (blue-blind)",
};

function describe(check: ContrastCheck): string {
  if (check.kind === "cvd")
    return `${check.slot} and ${check.against} look alike with ${DEFICIENCY[check.deficiency]}`;
  return `${check.slot} on ${check.against}${check.kind === "text" ? " (text)" : ""}`;
}

function result(check: ContrastCheck): string {
  return check.kind === "cvd"
    ? `ΔE ${check.deltaE.toFixed(3)}, needs ${check.required}`
    : `${check.ratio.toFixed(2)}:1, needs ${check.required}:1`;
}

export function ContrastReport({ checks, onUseShade }: Props) {
  const failures = checks.filter((c) => !c.pass);
  const passes = checks.length - failures.length;

  return (
    <section aria-labelledby="contrast-heading" className="rounded-lg border border-border p-5">
      <h2 id="contrast-heading" className="font-heading">
        Contrast
      </h2>
      <p className="mt-1 text-sm text-muted-fg">
        Text needs 4.5:1, and room and presence colors 3:1 against the map and cards (WCAG AA). Room
        states must also stay apart for color-blind viewers.
      </p>

      {failures.length === 0 ? (
        <p role="status" className="mt-3 rounded-md bg-muted p-3 text-sm">
          All {checks.length} checks pass.
        </p>
      ) : (
        <table className="mt-3 w-full text-left text-sm">
          <caption className="pb-2 text-left font-medium text-destructive">
            {failures.length} {failures.length === 1 ? "check fails" : "checks fail"}, {passes} pass
          </caption>
          <thead className="border-b border-border text-xs uppercase text-muted-fg">
            <tr>
              <th className="py-2 pr-3 font-medium">Mode</th>
              <th className="py-2 pr-3 font-medium">Check</th>
              <th className="py-2 pr-3 font-medium">Result</th>
              <th className="py-2 font-medium">Fix</th>
            </tr>
          </thead>
          <tbody>
            {failures.map((check) => {
              const key = `${check.mode}|${check.kind}|${check.slot}|${check.against}|${
                check.kind === "cvd" ? check.deficiency : ""
              }`;
              return (
                <tr key={key} className="border-b border-border last:border-0">
                  <td className="py-2 pr-3">{check.mode}</td>
                  <td className="py-2 pr-3">{describe(check)}</td>
                  <td className="py-2 pr-3 tabular-nums">{result(check)}</td>
                  <td className="py-2">
                    {check.kind !== "cvd" && check.suggestion ? (
                      <button
                        type="button"
                        onClick={() => onUseShade(check.slot, check.mode, check.suggestion!)}
                        className="inline-flex items-center gap-1.5 underline"
                      >
                        <span
                          aria-hidden="true"
                          className="inline-block h-3.5 w-3.5 rounded border border-border"
                          style={{ backgroundColor: check.suggestion }}
                        />
                        Use {check.suggestion} for {check.slot} ({check.mode})
                      </button>
                    ) : (
                      <span className="text-muted-fg">
                        {check.kind === "cvd"
                          ? "Make one clearly lighter or darker"
                          : "No shade of this hue passes"}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
