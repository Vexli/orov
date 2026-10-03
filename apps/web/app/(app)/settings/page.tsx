import { formatRegion, REGION_DISPLAY_LABELS, REGION_DISPLAYS } from "@officeorg/core";
import { requireUser } from "@/lib/session";
import { saveSettingsAction } from "./actions";

// One subdivision and one country-only code, so each option shows its fallback too.
const EXAMPLES = ["US-CA", "IN"];

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
          That option isn&apos;t available. Pick one from the list.
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
                    {EXAMPLES.map((code) => formatRegion(code, display)).join(" · ")}
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
