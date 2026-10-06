import type { CalendarPresenceEvent } from "./types";

// Which kinds of presence event the calendar can report. At least one is true.
export interface CalendarCapabilities {
  outOfOffice: boolean;
  workingLocation: boolean;
}

export interface CalendarProvider {
  // The value of CALENDAR_PROVIDER, and presence_signal.provider for the signals it produces.
  readonly id: string;
  readonly label: string;
  readonly capabilities: CalendarCapabilities;

  // Out-of-office and working-location events on this person's calendar that overlap
  // [from, to), of the kinds the capabilities name. Other events are never returned, so the
  // presence job never sees meeting titles it has no use for.
  presenceEvents(email: string, from: Date, to: Date): Promise<CalendarPresenceEvent[]>;
}

export const NO_CALENDAR_CAPABILITIES: CalendarCapabilities = {
  outOfOffice: false,
  workingLocation: false,
};

export function calendarCapabilities(provider: CalendarProvider | null): CalendarCapabilities {
  return provider?.capabilities ?? NO_CALENDAR_CAPABILITIES;
}
