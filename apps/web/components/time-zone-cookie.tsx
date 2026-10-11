"use client";

import { useEffect } from "react";
import { TIME_ZONE_COOKIE } from "@/lib/time-zone-cookie";

// Records the browser's time zone in a cookie, once, for server-formatted times (#27). Times on
// the first page ever loaded are in UTC; every later one uses this.
export function TimeZoneCookie() {
  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const current = document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${TIME_ZONE_COOKIE}=`))
      ?.slice(TIME_ZONE_COOKIE.length + 1);
    if (zone && current !== encodeURIComponent(zone)) {
      document.cookie = `${TIME_ZONE_COOKIE}=${encodeURIComponent(zone)}; path=/; max-age=31536000; samesite=lax`;
    }
  }, []);
  return null;
}
