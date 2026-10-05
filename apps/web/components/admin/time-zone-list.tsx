"use client";

import { useSyncExternalStore } from "react";
import { timeZoneOptions } from "@orov/core/time/zones";

const noop = () => () => {};
// The same array on every call, as useSyncExternalStore requires.
let cached: string[] | null = null;
const zones = () => (cached ??= timeZoneOptions());

// Suggestions for a time zone input (`list={id}`). Filled only in the browser: the server's and
// the browser's lists of zones can differ, which would make the page fail to hydrate.
export function TimeZoneList({ id }: { id: string }) {
  const options = useSyncExternalStore(noop, zones, () => null);
  return (
    <datalist id={id}>
      {options?.map((zone) => (
        <option key={zone} value={zone} />
      ))}
    </datalist>
  );
}
