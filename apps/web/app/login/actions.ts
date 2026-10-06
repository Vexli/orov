"use server";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth, SIGN_IN_ERROR } from "@/lib/auth";
import { getAuthSetup } from "@/lib/auth-providers";
import type { DevSignInBody } from "@/lib/dev-sign-in";

// Starts a single sign-on: Better Auth answers with the provider's authorization URL and sets the
// OAuth state cookie. A refused sign-in comes back to /login?error=<code>.
export async function signInWithProvider(providerId: string) {
  if (!getAuthSetup().sso.some((p) => p.id === providerId)) {
    redirect(`/login?error=${SIGN_IN_ERROR.configuration}`);
  }
  const { url } = await getAuth().api.signInSocial({
    body: { provider: providerId, callbackURL: "/", errorCallbackURL: "/login" },
    headers: await headers(),
  });
  if (!url) redirect(`/login?error=${SIGN_IN_ERROR.configuration}`);
  redirect(url);
}

// The development plugin's endpoint is registered only when development sign-in is allowed, so
// the typed API doesn't always have it.
async function devSignIn(body: DevSignInBody) {
  const api = getAuth().api as unknown as {
    devSignIn?: (input: { body: DevSignInBody; headers: Headers }) => Promise<unknown>;
  };
  if (!api.devSignIn) redirect(`/login?error=${SIGN_IN_ERROR.configuration}`);
  try {
    await api.devSignIn({ body, headers: await headers() });
  } catch (error) {
    if (!(error instanceof APIError)) throw error;
    const code = (error.body as { code?: string } | undefined)?.code;
    redirect(`/login?error=${code === SIGN_IN_ERROR.credentials ? code : SIGN_IN_ERROR.accessDenied}`);
  }
  redirect("/");
}

export async function signInWithDevPassword(formData: FormData) {
  if (!getAuthSetup().devPassword) redirect(`/login?error=${SIGN_IN_ERROR.configuration}`);
  await devSignIn({
    method: "dev-password",
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
}

export async function signInWithDevBypass() {
  if (!getAuthSetup().devBypassEmail) redirect(`/login?error=${SIGN_IN_ERROR.configuration}`);
  await devSignIn({ method: "dev-bypass" });
}
