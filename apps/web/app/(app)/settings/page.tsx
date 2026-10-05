import {
  DATE_FORMAT_LABELS,
  DATE_FORMATS,
  flagEmoji,
  formatDateTime,
  formatRegion,
  REGION_DISPLAY_LABELS,
  REGION_DISPLAYS,
} from "@orov/core";
import { requireUser } from "@/lib/session";
import { saveSettingsAction } from "./actions";

// One subdivision and one country-only code, so each option shows its fallback too.
const EXAMPLES = ["US-CA", "IN"];
// An afternoon in a month with a two-digit day, so day/month order is visible in each example.
const EXAMPLE_TIME = new Date("2026-10-24T14:30:00Z");

interface Props {
  searchParams: Promise<{ saved?: string; error?: string }>;
}

// Personal settings. Each user sees only their own, and changing them affects no one else.
export default async function SettingsPage({ searchParams }: Props) {
  const user = await requireUser();
  const { saved, error } = await searchParams;

  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-heading">Settings</h1>

      {saved ? (
        <p role="status" className="mt-4 rounded-md bg-muted p-3 text-sm">
          Settings saved.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          One of those options isn&apos;t available. Pick from the lists.
        </p>
      ) : null}

      <form action={saveSettingsAction} className="mt-6">
        <fieldset>
          <legend className="text-sm font-medium">Show locations as</legend>
          <p className="mt-1 text-xs text-muted-fg">
            Applies to where people are based and to office locations, everywhere in the app.
          </p>
          <div className="mt-3 space-y-2">
            {REGION_DISPLAYS.map((display) => (
              <label
                key={display}
                className="flex items-start gap-3 rounded-md border border-border px-3 py-2 text-sm"
              >
                <input
                  type="radio"
                  name="regionDisplay"
                  value={display}
                  defaultChecked={user.regionDisplay === display}
                  className="mt-1"
                />
                <span>
                  <span className="block font-medium">{REGION_DISPLAY_LABELS[display]}</span>
                  <span className="block text-xs text-muted-fg">
                    {display === "flag"
                      ? EXAMPLES.map((code) => `${flagEmoji(code)} (${formatRegion(code, "country")})`).join(" · ")
                      : EXAMPLES.map((code) => formatRegion(code, display)).join(" · ")}
                  </span>
                </span>
              </label>
            ))}
          </div>
          {/* Not "Country …": the region options' labels are matched by that prefix. */}
          <label className="mt-3 flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm">
            <input type="checkbox" name="regionFlag" defaultChecked={user.regionFlag} />
            <span>
              <span className="block font-medium">Show country flags</span>
              <span className="block text-xs text-muted-fg">
                <span aria-hidden="true">{flagEmoji("CA-ON")} </span>Ontario, Canada. Some systems, such as
                Windows, show the country&apos;s letters instead of a flag.
              </span>
            </span>
          </label>
        </fieldset>
        <fieldset className="mt-6">
          <legend className="text-sm font-medium">Show dates as</legend>
          <p className="mt-1 text-xs text-muted-fg">
            Times are shown in {user.timeZone}. CSV files always use ISO 8601.
          </p>
          <div className="mt-3 space-y-2">
            {DATE_FORMATS.map((format) => (
              <label
                key={format}
                className="flex items-start gap-3 rounded-md border border-border px-3 py-2 text-sm"
              >
                <input
                  type="radio"
                  name="dateFormat"
                  value={format}
                  defaultChecked={user.dateFormat === format}
                  className="mt-1"
                />
                <span>
                  <span className="block font-medium">{DATE_FORMAT_LABELS[format]}</span>
                  <span className="block text-xs text-muted-fg">
                    {formatDateTime(EXAMPLE_TIME, format, "UTC")}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <button
          type="submit"
          className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg"
        >
          Save settings
        </button>
      </form>
    </div>
  );
}
