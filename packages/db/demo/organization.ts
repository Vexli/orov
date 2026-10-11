// The demo organization: three offices, six floors, a four-level team tree and about 120 people,
// generated deterministically (a fixed seed), so rebuilding the demo file changes it only when this
// file changes. Everyone is fictional; email addresses are on example.com, which no one can own.
//
// It shows off what the app does: teams that sit together and teams split across offices, a team
// tree four levels deep, several people with two managers, people without a desk in an office,
// remote people in other countries, inactive people with a last day, profile links, phone numbers,
// floors called Floor, Level or Building, and one office with its own map colors.

import type { FloorPlan } from "./floors";

export interface OfficeSpec {
  slug: string;
  name: string;
  region: string;
  timezone: string;
  floorLabel: { singular: string; plural: string };
  phonePrefix: string;
  floors: {
    slug: string;
    name: string;
    level: number;
    plan: FloorPlan;
    roomSeats: Record<string, number>;
  }[];
  // Map colors for this office only (Phase 6), or none.
  mapTheme?: { light: Record<string, string>; dark: Record<string, string> };
}

export const OFFICES: OfficeSpec[] = [
  {
    slug: "sf",
    name: "San Francisco",
    region: "US-CA",
    timezone: "America/Los_Angeles",
    floorLabel: { singular: "Floor", plural: "Floors" },
    phonePrefix: "+1415555",
    floors: [
      {
        slug: "4",
        name: "Floor 4",
        level: 4,
        plan: {
          floorSlug: "4",
          areas: [
            { slug: "north", desks: 12 },
            { slug: "south", desks: 12 },
          ],
          rooms: ["golden-gate", "presidio", "phone-1", "phone-2"],
          pois: ["kitchen", "elevator", "restroom"],
        },
        roomSeats: { "golden-gate": 12, presidio: 6, "phone-1": 1, "phone-2": 1 },
      },
      {
        slug: "5",
        name: "Floor 5",
        level: 5,
        plan: {
          floorSlug: "5",
          areas: [
            { slug: "east", desks: 12 },
            { slug: "west", desks: 12 },
          ],
          rooms: ["alcatraz", "mission", "phone-3"],
          pois: ["kitchen", "elevator"],
        },
        roomSeats: { alcatraz: 10, mission: 4, "phone-3": 1 },
      },
    ],
  },
  {
    slug: "lon",
    name: "London",
    region: "GB-ENG",
    timezone: "Europe/London",
    floorLabel: { singular: "Level", plural: "Levels" },
    phonePrefix: "+44207946",
    floors: [
      {
        slug: "1",
        name: "Level 1",
        level: 1,
        plan: {
          floorSlug: "1",
          areas: [
            { slug: "atrium", desks: 10 },
            { slug: "garden", desks: 10 },
          ],
          rooms: ["thames", "camden", "phone-1"],
          pois: ["kitchen", "elevator", "restroom"],
        },
        roomSeats: { thames: 14, camden: 6, "phone-1": 1 },
      },
      {
        slug: "2",
        name: "Level 2",
        level: 2,
        plan: {
          floorSlug: "2",
          areas: [
            { slug: "library", desks: 10 },
            { slug: "studio", desks: 10 },
          ],
          rooms: ["soho", "phone-2"],
          pois: ["elevator", "restroom"],
        },
        roomSeats: { soho: 8, "phone-2": 1 },
      },
    ],
    mapTheme: {
      light: { "map.selection": "#7c3aed", "map.highlight": "#0e7490" },
      dark: { "map.selection": "#a78bfa", "map.highlight": "#22d3ee" },
    },
  },
  {
    slug: "ber",
    name: "Berlin",
    region: "DE-BE",
    timezone: "Europe/Berlin",
    floorLabel: { singular: "Building", plural: "Buildings" },
    phonePrefix: "+493012345",
    floors: [
      {
        slug: "a",
        name: "Building A",
        level: 1,
        plan: {
          floorSlug: "a",
          areas: [
            { slug: "courtyard", desks: 8 },
            { slug: "loft", desks: 8 },
          ],
          rooms: ["spree", "phone-1"],
          pois: ["kitchen", "restroom"],
        },
        roomSeats: { spree: 10, "phone-1": 1 },
      },
      {
        slug: "b",
        name: "Building B",
        level: 2,
        plan: {
          floorSlug: "b",
          areas: [
            { slug: "workshop", desks: 8 },
            { slug: "terrace", desks: 8 },
          ],
          rooms: ["tempelhof", "phone-2"],
          pois: ["kitchen", "elevator"],
        },
        roomSeats: { tempelhof: 16, "phone-2": 1 },
      },
    ],
  },
];

export interface TeamSpec {
  slug: string;
  name: string;
  parent: string | null;
  color?: string;
  // Where the members sit, in order: an office slug, "remote:<region>:<zone>" for someone working
  // from another country, or "office:<slug>" for someone who belongs to an office without a desk.
  // The first entry is the lead's.
  members: string[];
  titles: { lead: string; member: string[] };
}

const repeat = (place: string, n: number) => Array.from({ length: n }, () => place);

export const TEAMS: TeamSpec[] = [
  {
    slug: "executive",
    name: "Executive",
    parent: null,
    color: "#334155",
    members: repeat("sf", 2),
    titles: { lead: "Chief Executive Officer", member: ["Executive Assistant"] },
  },
  {
    slug: "engineering",
    name: "Engineering",
    parent: null,
    color: "#2563eb",
    members: ["sf"],
    titles: { lead: "VP of Engineering", member: [] },
  },
  {
    slug: "platform",
    name: "Platform",
    parent: "engineering",
    members: ["ber"],
    titles: { lead: "Director of Platform", member: [] },
  },
  {
    slug: "infrastructure",
    name: "Infrastructure",
    parent: "platform",
    members: [...repeat("ber", 8), "remote:IN-KA:Asia/Kolkata"],
    titles: {
      lead: "Infrastructure Lead",
      member: [
        "Site Reliability Engineer",
        "Infrastructure Engineer",
        "Senior Infrastructure Engineer",
      ],
    },
  },
  {
    slug: "developer-experience",
    name: "Developer Experience",
    parent: "platform",
    members: repeat("ber", 7),
    titles: {
      lead: "Developer Experience Lead",
      member: ["Developer Tools Engineer", "Build Engineer"],
    },
  },
  {
    slug: "product-engineering",
    name: "Product Engineering",
    parent: "engineering",
    members: ["sf"],
    titles: { lead: "Director of Product Engineering", member: [] },
  },
  {
    slug: "web",
    name: "Web",
    parent: "product-engineering",
    members: [...repeat("sf", 11), "remote:CA-ON:America/Toronto"],
    titles: {
      lead: "Web Engineering Manager",
      member: ["Frontend Engineer", "Senior Frontend Engineer", "Full-Stack Engineer"],
    },
  },
  {
    slug: "mobile",
    name: "Mobile",
    parent: "product-engineering",
    members: repeat("sf", 8),
    titles: { lead: "Mobile Engineering Manager", member: ["iOS Engineer", "Android Engineer"] },
  },
  {
    slug: "data",
    name: "Data",
    parent: "engineering",
    members: [...repeat("lon", 7), "remote:ES-MD:Europe/Madrid"],
    titles: {
      lead: "Head of Data",
      member: ["Data Engineer", "Data Scientist", "Analytics Engineer"],
    },
  },
  {
    slug: "product",
    name: "Product",
    parent: null,
    color: "#7c3aed",
    members: ["sf"],
    titles: { lead: "Chief Product Officer", member: [] },
  },
  {
    slug: "design",
    name: "Design",
    parent: "product",
    members: ["sf", "sf", "lon", "lon", "sf", "lon"],
    titles: { lead: "Head of Design", member: ["Product Designer", "UX Researcher"] },
  },
  {
    slug: "product-management",
    name: "Product Management",
    parent: "product",
    members: repeat("lon", 5),
    titles: { lead: "Director of Product", member: ["Product Manager", "Senior Product Manager"] },
  },
  {
    slug: "go-to-market",
    name: "Go-to-Market",
    parent: null,
    color: "#ea580c",
    members: ["lon"],
    titles: { lead: "Chief Revenue Officer", member: [] },
  },
  {
    slug: "sales",
    name: "Sales",
    parent: "go-to-market",
    members: ["lon"],
    titles: { lead: "VP of Sales", member: [] },
  },
  {
    slug: "sales-americas",
    name: "Sales Americas",
    parent: "sales",
    members: [...repeat("sf", 6), "office:sf", "office:sf"],
    titles: {
      lead: "Sales Director, Americas",
      member: ["Account Executive", "Sales Development Representative"],
    },
  },
  {
    slug: "sales-emea",
    name: "Sales EMEA",
    parent: "sales",
    members: [...repeat("lon", 6), "office:lon", "office:ber"],
    titles: {
      lead: "Sales Director, EMEA",
      member: ["Account Executive", "Sales Development Representative"],
    },
  },
  {
    slug: "marketing",
    name: "Marketing",
    parent: "go-to-market",
    members: repeat("lon", 6),
    titles: {
      lead: "Head of Marketing",
      member: ["Content Marketer", "Product Marketing Manager", "Growth Marketer"],
    },
  },
  {
    slug: "customer-success",
    name: "Customer Success",
    parent: "go-to-market",
    members: [
      ...repeat("ber", 6),
      "remote:AU-NSW:Australia/Sydney",
      "remote:BR-SP:America/Sao_Paulo",
    ],
    titles: {
      lead: "Head of Customer Success",
      member: ["Customer Success Manager", "Support Engineer"],
    },
  },
  {
    slug: "people",
    name: "People",
    parent: null,
    color: "#db2777",
    members: ["lon"],
    titles: { lead: "Chief People Officer", member: [] },
  },
  {
    slug: "recruiting",
    name: "Recruiting",
    parent: "people",
    members: [...repeat("lon", 3), "remote:IE:Europe/Dublin"],
    titles: { lead: "Head of Talent", member: ["Recruiter", "Recruiting Coordinator"] },
  },
  {
    slug: "people-operations",
    name: "People Operations",
    parent: "people",
    members: repeat("sf", 3),
    titles: { lead: "People Operations Lead", member: ["People Partner"] },
  },
  {
    slug: "finance",
    name: "Finance",
    parent: null,
    color: "#16a34a",
    members: ["sf"],
    titles: { lead: "Chief Financial Officer", member: [] },
  },
  {
    slug: "payroll",
    name: "Payroll",
    parent: "finance",
    members: repeat("ber", 3),
    titles: { lead: "Payroll Manager", member: ["Payroll Specialist"] },
  },
  {
    slug: "accounting",
    name: "Accounting",
    parent: "finance",
    members: repeat("sf", 3),
    titles: { lead: "Controller", member: ["Accountant"] },
  },
  {
    slug: "workplace",
    name: "Workplace",
    parent: null,
    color: "#ca8a04",
    members: ["sf", "lon", "ber"],
    titles: { lead: "Workplace Manager", member: ["Office Manager"] },
  },
];

// Given and family names from many places, combined by the seeded generator.
export const GIVEN_NAMES = [
  "Ada",
  "Aiko",
  "Alejandro",
  "Amara",
  "Anders",
  "Ana",
  "Arjun",
  "Astrid",
  "Beatriz",
  "Bilal",
  "Camille",
  "Chen",
  "Chiara",
  "Dagny",
  "Daniel",
  "Dariusz",
  "Deepa",
  "Elena",
  "Emeka",
  "Emil",
  "Fatima",
  "Felix",
  "Freya",
  "Gabriel",
  "Grace",
  "Hamid",
  "Hana",
  "Ines",
  "Isaac",
  "Ivana",
  "Jakob",
  "Jamal",
  "Jin",
  "Joaquin",
  "Kaito",
  "Kalani",
  "Karim",
  "Kofi",
  "Lars",
  "Leila",
  "Lena",
  "Lucia",
  "Mads",
  "Maya",
  "Mei",
  "Mateo",
  "Nadia",
  "Niamh",
  "Nikolai",
  "Noor",
  "Olu",
  "Oskar",
  "Paloma",
  "Priyanka",
  "Rafael",
  "Rania",
  "Ravi",
  "Rosa",
  "Sana",
  "Santiago",
  "Sofia",
  "Soren",
  "Tariq",
  "Thandiwe",
  "Tomas",
  "Uma",
  "Valentina",
  "Wei",
  "Yara",
  "Yusuf",
  "Zara",
  "Zeynep",
];

export const FAMILY_NAMES = [
  "Abara",
  "Adeyemi",
  "Alvarez",
  "Andersen",
  "Bauer",
  "Bergström",
  "Castillo",
  "Chowdhury",
  "Costa",
  "Dang",
  "Delgado",
  "Dubois",
  "Eriksen",
  "Fischer",
  "Fujita",
  "Gallagher",
  "García",
  "Gupta",
  "Haddad",
  "Hansen",
  "Hoffmann",
  "Ibrahim",
  "Ivanova",
  "Jensen",
  "Kaur",
  "Kim",
  "Kowalski",
  "Lambert",
  "Larsen",
  "Li",
  "Lindqvist",
  "Mahlangu",
  "Martins",
  "Mensah",
  "Moreau",
  "Müller",
  "Nakamura",
  "Nguyen",
  "Novak",
  "Nowak",
  "O'Brien",
  "Okafor",
  "Olsen",
  "Park",
  "Patel",
  "Petrov",
  "Quinn",
  "Rahman",
  "Reyes",
  "Rossi",
  "Sato",
  "Schmidt",
  "Silva",
  "Singh",
  "Sørensen",
  "Tanaka",
  "Torres",
  "Van der Berg",
  "Vargas",
  "Wagner",
  "Walsh",
  "Weber",
  "Yamamoto",
  "Yilmaz",
  "Zhang",
];

// A small, fast, seeded generator (mulberry32), so every build makes the same organization.
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// "Sørensen" → "sorensen", "O'Brien" → "obrien", "Van der Berg" → "vanderberg": for emails and
// handles, which are ASCII.
export function asciiHandle(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/ø/gi, "o")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}
