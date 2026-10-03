"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";
import { getAuthSetup } from "@/lib/auth-providers";

// signIn throws AuthError for a rejected sign-in, and a redirect for a successful one, which
// must propagate.
async function signInOrShowError(...args: Parameters<typeof signIn>) {
  try {
    await signIn(...args);
  } catch (error) {
    if (error instanceof AuthError) redirect(`/login?error=${error.type}`);
    throw error;
  }
}

export async function signInWithProvider(providerId: string) {
  if (!getAuthSetup().sso.some((p) => p.id === providerId)) redirect("/login?error=Configuration");
  await signInOrShowError(providerId, { redirectTo: "/" });
}

export async function signInWithDevPassword(formData: FormData) {
  if (!getAuthSetup().devPassword) redirect("/login?error=Configuration");
  await signInOrShowError("dev-password", {
    email: formData.get("email"),
    password: formData.get("password"),
    redirectTo: "/",
  });
}

export async function signInWithDevBypass() {
  if (!getAuthSetup().devBypassEmail) redirect("/login?error=Configuration");
  await signInOrShowError("dev-bypass", { redirectTo: "/" });
}
