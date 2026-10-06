import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { parseFloorSvg } from "@orov/core/svg/parse";
import { sanitizeSvg } from "@orov/core/svg/sanitize";
import { locationThemeSchema } from "@orov/core/theme/location-override";
import type { Database } from "../client";
import { syncInheritedMemberships } from "../queries/memberships";
import { applyTheme } from "../queries/theme";
import * as s from "../schema";
import { drawFloor } from "./floors";
import {
  asciiHandle,
  FAMILY_NAMES,
  GIVEN_NAMES,
  OFFICES,
  seededRandom,
  TEAMS,
} from "./organization";

// Writes the demo organization (organization.ts) into an empty database. `pnpm demo:build` runs
// it and exports the result as the demo file; nothing else calls it.

const SEED = 20261006;
const DEMO_ACTOR = "demo";

type PersonRow = typeof s.person.$inferInsert;

export async function buildDemoOrganization(db: Database): Promise<void> {
  const random = seededRandom(SEED);
  const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)]!;
  const isoDate = (from: Date, to: Date) =>
    new Date(from.getTime() + random() * (to.getTime() - from.getTime()))
      .toISOString()
      .slice(0, 10);

  await db.transaction(async (tx) => {
    // Offices, floors and their drawings. Areas and spaces are read from each drawing by the
    // upload parser, so they are what an upload of the drawing would create.
    const freeDesks = new Map<string, string[]>();
    for (const [i, office] of OFFICES.entries()) {
      const locationId = `loc_${office.slug}`;
      await tx.insert(s.location).values({
        id: locationId,
        slug: office.slug,
        name: office.name,
        timezone: office.timezone,
        region: office.region,
        sortOrder: i + 1,
        floorLabelSingular: office.floorLabel.singular,
        floorLabelPlural: office.floorLabel.plural,
        mapTheme: office.mapTheme ? locationThemeSchema.parse(office.mapTheme) : null,
      });
      const desks: string[] = [];
      for (const floor of office.floors) {
        const floorId = `fl_${office.slug}_${floor.slug}`;
        await tx.insert(s.floor).values({
          id: floorId,
          locationId,
          slug: floor.slug,
          name: floor.name,
          level: floor.level,
          sortOrder: floor.level,
        });
        const svg = sanitizeSvg(drawFloor(floor.plan));
        const assetId = `svg_${office.slug}_${floor.slug}_v1`;
        await tx.insert(s.svgAsset).values({
          id: assetId,
          floorId,
          version: 1,
          sanitizedSvg: svg,
          sha256: createHash("sha256").update(svg).digest("hex"),
          uploadedBy: DEMO_ACTOR,
        });
        await tx.update(s.floor).set({ svgAssetId: assetId }).where(eq(s.floor.id, floorId));

        const parsed = parseFloorSvg(svg, { floorSlug: floor.slug, locationSlug: office.slug });
        if (parsed.errors.length > 0) throw new Error(`${floorId}: ${parsed.errors.join("; ")}`);
        const areaIds = new Map(
          parsed.areas.map((a) => [a.svgElementId, `area_${office.slug}_${floor.slug}_${a.slug}`]),
        );
        await tx.insert(s.area).values(
          parsed.areas.map((a) => ({
            id: areaIds.get(a.svgElementId)!,
            floorId,
            slug: a.slug,
            name: a.name,
            svgElementId: a.svgElementId,
          })),
        );
        const spaces = parsed.spaces.map((sp) => ({
          id: `sp_${office.slug}_${floor.slug}_${sp.svgElementId.replace(/-/g, "_")}`,
          floorId,
          areaId: sp.areaSvgElementId ? areaIds.get(sp.areaSvgElementId)! : null,
          kind: sp.kind,
          svgElementId: sp.svgElementId,
          name: sp.name,
          capacity: floor.roomSeats[sp.svgElementId.replace(/^room-/, "")] ?? null,
        }));
        await tx.insert(s.space).values(spaces);
        desks.push(...spaces.filter((sp) => sp.kind === "desk").map((sp) => sp.id));
      }
      freeDesks.set(office.slug, desks);
    }

    // People, team by team, so each team sits together in its office.
    const usedEmails = new Set<string>();
    const people: (PersonRow & { id: string; team: string })[] = [];
    const leads = new Map<string, string>();
    const newPerson = (
      team: string,
      title: string,
      place: string,
    ): PersonRow & { id: string; team: string } => {
      let given: string;
      let family: string;
      let email: string;
      do {
        given = pick(GIVEN_NAMES);
        family = pick(FAMILY_NAMES);
        email = `${asciiHandle(given)}.${asciiHandle(family)}@example.com`;
      } while (usedEmails.has(email));
      usedEmails.add(email);

      const [kind, region, zone] = place.startsWith("remote:")
        ? (place.split(":") as [string, string, string])
        : place.startsWith("office:")
          ? ["office", place.slice("office:".length), ""]
          : ["desk", place, ""];
      const office = OFFICES.find((o) => o.slug === (kind === "remote" ? "" : region));
      const desk = kind === "desk" ? freeDesks.get(region)!.shift() : undefined;
      if (kind === "desk" && !desk) throw new Error(`${region} has no free desk for ${email}`);
      const phoneSuffix = String(Math.floor(random() * 100)).padStart(2, "0");
      return {
        id: `p_${asciiHandle(given)}_${asciiHandle(family)}`,
        team,
        email,
        givenName: given,
        familyName: family,
        title,
        homeRegion: kind === "remote" ? region : office!.region,
        // Remote people say where they work from; everyone else takes their office's zone.
        homeTimezone: kind === "remote" ? zone : null,
        phone:
          office && random() < 0.7
            ? office.slug === "sf"
              ? `${office.phonePrefix}01${phoneSuffix}`
              : `${office.phonePrefix}0${phoneSuffix}${Math.floor(random() * 10)}`
            : null,
        assignedDeskId: desk ?? null,
        officeId: kind === "office" ? `loc_${office!.slug}` : null,
        startDate: isoDate(new Date("2016-01-04"), new Date("2026-09-01")),
        active: true,
      };
    };

    for (const team of TEAMS) {
      team.members.forEach((place, i) => {
        const title = i === 0 ? team.titles.lead : pick(team.titles.member);
        const person = newPerson(team.slug, title, place);
        if (i === 0) leads.set(team.slug, person.id);
        people.push(person);
      });
    }
    // People who have left: inactive, with a last day, and no desk.
    for (const team of ["web", "sales-americas", "marketing", "infrastructure"]) {
      const spec = TEAMS.find((t) => t.slug === team)!;
      const person = newPerson(team, pick(spec.titles.member), `office:${spec.members[1]}`);
      people.push({
        ...person,
        officeId: null,
        active: false,
        endDate: isoDate(new Date("2025-01-06"), new Date("2026-08-28")),
      });
    }
    await tx.insert(s.person).values(people.map(({ team: _team, ...row }) => row));

    // Teams and their leads.
    await tx.insert(s.team).values(
      TEAMS.map((t) => ({
        id: `t_${t.slug.replace(/-/g, "_")}`,
        slug: t.slug,
        name: t.name,
        parentTeamId: t.parent ? `t_${t.parent.replace(/-/g, "_")}` : null,
        leadId: leads.get(t.slug)!,
        color: t.color ?? null,
      })),
    );
    const teamId = (slug: string) => `t_${slug.replace(/-/g, "_")}`;

    // Reporting lines: a lead reports to the lead of the team above (top-level leads to the
    // chief executive), everyone else to their team's lead. London's designers also report to
    // the director of product, and the first two marketers to the chief revenue officer.
    const ceo = leads.get("executive")!;
    const managers: { personId: string; managerId: string; position: number }[] = [];
    for (const p of people) {
      const spec = TEAMS.find((t) => t.slug === p.team)!;
      const isLead = leads.get(p.team) === p.id;
      const manager = isLead
        ? spec.parent
          ? leads.get(spec.parent)!
          : p.id === ceo
            ? null
            : ceo
        : leads.get(p.team)!;
      if (manager) managers.push({ personId: p.id, managerId: manager, position: 0 });
    }
    const second = (
      team: string,
      filter: (p: (typeof people)[number]) => boolean,
      managerTeam: string,
      count: number,
    ) =>
      people
        .filter(
          (p) => p.team === team && leads.get(team) !== p.id && p.active !== false && filter(p),
        )
        .slice(0, count)
        .forEach((p) =>
          managers.push({ personId: p.id, managerId: leads.get(managerTeam)!, position: 1 }),
        );
    second("design", (p) => p.homeRegion === "GB-ENG", "product-management", 3);
    second("marketing", () => true, "go-to-market", 2);
    await tx.insert(s.personManager).values(managers);

    // Memberships: each person's own team as their primary one; the San Francisco designers are
    // also members of Web. Memberships of the teams above follow from sub-teams.
    await tx
      .insert(s.teamMember)
      .values([
        ...people.map((p) => ({ personId: p.id, teamId: teamId(p.team), isPrimary: true })),
        ...people
          .filter(
            (p) => p.team === "design" && p.homeRegion === "US-CA" && leads.get("design") !== p.id,
          )
          .map((p) => ({ personId: p.id, teamId: teamId("web"), isPrimary: false })),
      ]);
    await syncInheritedMemberships(tx);

    // Other accounts: engineers have GitHub, about half of everyone LinkedIn, a few a website.
    const engineering = new Set([
      "engineering",
      "platform",
      "infrastructure",
      "developer-experience",
      "product-engineering",
      "web",
      "mobile",
      "data",
    ]);
    await tx.insert(s.personIdentity).values(
      people.flatMap((p) => {
        const handle = `${asciiHandle(p.givenName)}-${asciiHandle(p.familyName ?? "")}`;
        const rows: { personId: string; provider: string; value: string }[] = [];
        if (engineering.has(p.team))
          rows.push({ personId: p.id, provider: "github", value: handle });
        if (random() < 0.5) rows.push({ personId: p.id, provider: "linkedin", value: handle });
        if (random() < 0.08)
          rows.push({
            personId: p.id,
            provider: "website",
            value: `https://${handle}.example.com/`,
          });
        return rows;
      }),
    );

    // A few people have signed in before. Roles in the file are applied only if the importing
    // admin asks; the chief executive and the San Francisco workplace manager are admins.
    const signedIn = [
      ceo,
      leads.get("workplace")!,
      leads.get("web")!,
      leads.get("design")!,
      leads.get("data")!,
    ];
    await tx.insert(s.appUser).values(
      signedIn.map((id, i) => ({
        email: people.find((p) => p.id === id)!.email,
        role: i < 2 ? ("admin" as const) : ("viewer" as const),
        regionFlag: i % 2 === 0,
      })),
    );
  });

  // A theme with its own name and colors, applied the way the Branding page applies one, so it
  // passes the same checks. Importing the demo applies it; roll back on the Branding page.
  await applyTheme(
    db,
    DEMO_ACTOR,
    {
      files: [],
      darkMode: true,
      fonts: [],
      mapping: {
        appName: { light: "OrOv Demo" },
        primary: { light: "#0f766e", dark: "#2dd4bf" },
        "primary-fg": { light: "#ffffff", dark: "#042f2e" },
        ring: { light: "#0f766e", dark: "#2dd4bf" },
        accent: { light: "#ccfbf1", dark: "#134e4a" },
        "accent-fg": { light: "#134e4a", dark: "#ccfbf1" },
      },
    },
    { overrideContrast: false },
  );
}
