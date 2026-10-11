import type { CalendarCapabilities, CalendarProvider } from "../calendar";
import type { CalendarPresenceEvent } from "../types";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface FakeCalendarOptions {
  // Events to serve. Defaults to demoCalendarEvents(now()).
  events?: readonly CalendarPresenceEvent[];
  now?: () => Date;
}

// The demo week, relative to `now`: Bob works from home today, and Priya is out of office from
// today until the end of tomorrow (UTC days).
export function demoCalendarEvents(now: Date): CalendarPresenceEvent[] {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = (n: number) => new Date(today.getTime() + n * DAY_MS);
  return [
    {
      ref: "wl-bob-0",
      email: "bob@example.com",
      kind: "working_location",
      location: "home",
      start: day(0),
      end: day(1),
    },
    {
      ref: "wl-jane-0",
      email: "jane@example.com",
      kind: "working_location",
      location: "office",
      start: day(0),
      end: day(1),
    },
    {
      ref: "ooo-priya",
      email: "priya@example.com",
      kind: "out_of_office",
      title: "Vacation",
      start: day(0),
      end: day(2),
    },
  ];
}

// An in-memory calendar for tests and offline development.
export class FakeCalendar implements CalendarProvider {
  readonly id = "fake";
  readonly label = "Fake calendar";
  readonly capabilities: CalendarCapabilities = { outOfOffice: true, workingLocation: true };

  private readonly events: readonly CalendarPresenceEvent[];

  constructor(options: FakeCalendarOptions = {}) {
    this.events = options.events ?? demoCalendarEvents((options.now ?? (() => new Date()))());
  }

  async presenceEvents(email: string, from: Date, to: Date): Promise<CalendarPresenceEvent[]> {
    if (from >= to) return [];
    const wanted = email.trim().toLowerCase();
    return this.events
      .filter((e) => e.email.toLowerCase() === wanted && e.start < to && e.end > from)
      .map((e) => ({ ...e }));
  }
}
