// Sign-in policy, kept free of framework imports so it can be unit tested.

export interface GoogleProfile {
  email: string;
  email_verified?: boolean;
  // Google sets `hd` only for Workspace accounts. Consumer accounts have no hd claim.
  hd?: string | null;
}

export type SignInDecision = { ok: true } | { ok: false; reason: string };

export function canSignIn(profile: GoogleProfile, companyDomain: string): SignInDecision {
  const domain = companyDomain.toLowerCase();
  const email = profile.email.toLowerCase();
  if (profile.email_verified !== true) return { ok: false, reason: "email is not verified" };
  if (profile.hd?.toLowerCase() !== domain) return { ok: false, reason: "not a company account" };
  if (!email.endsWith(`@${domain}`)) return { ok: false, reason: "email domain does not match" };
  return { ok: true };
}

// Admins are bootstrapped from ADMIN_EMAILS. Other people keep whatever role the database has.
export function isBootstrapAdmin(email: string, adminEmails: readonly string[]): boolean {
  const normalized = email.toLowerCase();
  return adminEmails.some((e) => e.trim().toLowerCase() === normalized);
}
