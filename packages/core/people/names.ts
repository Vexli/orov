// A person's name is stored as a given name and an optional family name (#2). The full name is
// "given family", which the database also keeps as person.name. Family-name-first order isn't
// supported yet; fullName is the one place to add a per-person order later.

export interface PersonName {
  givenName: string;
  familyName: string | null;
}

// The same rule as the migration that introduced the fields: split on the last run of
// whitespace, so "Mary Ann Smith" is "Mary Ann" and "Smith". A single word is a given name only.
export function splitFullName(name: string): PersonName {
  const trimmed = name.trim();
  const match = /^(.*\S)\s+(\S+)$/.exec(trimmed);
  return match ? { givenName: match[1]!, familyName: match[2]! } : { givenName: trimmed, familyName: null };
}

export function fullName({ givenName, familyName }: PersonName): string {
  return familyName ? `${givenName} ${familyName}` : givenName;
}

// One fixed collation, so the server and every browser sort the same way. Accents sort with
// their base letter ("Ångström" with the As); there is no UI locale yet (plan.md Phase 6).
const collator = new Intl.Collator("en");

// Lists sort by family name, then given name. Someone with a single name sorts by it.
export function compareByFamilyName(a: PersonName, b: PersonName): number {
  return (
    collator.compare(a.familyName ?? a.givenName, b.familyName ?? b.givenName) ||
    collator.compare(a.givenName, b.givenName)
  );
}
