// The demo organization the fakes describe. It mirrors the people and rooms in
// packages/db/seed.ts, so INTEGRATIONS=fake on a seeded database matches real rows.

import type { ExternalUser, RoomResource } from "../types";

export const DEMO_USERS: readonly ExternalUser[] = [
  {
    externalId: "FAKE-JANE",
    email: "jane@example.com",
    displayName: "Jane Park",
    title: "Head of HR",
  },
  {
    externalId: "FAKE-MAX",
    email: "max@example.com",
    displayName: "Max Osei",
    title: "HR Business Partner",
  },
  {
    externalId: "FAKE-BOB",
    email: "bob@example.com",
    displayName: "Bob Lindqvist",
    title: "Payroll Analyst",
  },
  {
    externalId: "FAKE-PRIYA",
    email: "priya@example.com",
    displayName: "Priya Raman",
    title: "Recruiter",
  },
  // Sam has no account, so the match job's "unmatched people" list has someone in it.
];

export const DEMO_STATUS_CHANNEL = "FAKE-STATUS";

// Resource ids use the reserved .invalid domain, so nothing can mistake them for real addresses.
export const DEMO_ROOMS: readonly RoomResource[] = [
  {
    resourceId: "boardroom@rooms.invalid",
    name: "Boardroom",
    capacity: 12,
    buildingId: "sf",
    floorName: "2",
  },
  {
    resourceId: "huddle-a@rooms.invalid",
    name: "Huddle A",
    capacity: 4,
    buildingId: "sf",
    floorName: "2",
    section: "South Wing",
  },
  {
    resourceId: "phone-1@rooms.invalid",
    name: "Phone Booth 1",
    capacity: 1,
    buildingId: "sf",
    floorName: "2",
  },
  {
    resourceId: "phone-2@rooms.invalid",
    name: "Phone Booth 2",
    capacity: 1,
    buildingId: "sf",
    floorName: "3",
    section: "West Wing",
  },
  {
    resourceId: "workshop@rooms.invalid",
    name: "Workshop",
    capacity: 20,
    buildingId: "sf",
    floorName: "3",
  },
];
