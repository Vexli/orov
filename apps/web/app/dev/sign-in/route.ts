import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";
import { getAuthSetup } from "@/lib/auth-providers";

// The proxy sends signed-out requests here when AUTH_DEV_BYPASS_EMAIL is active, so local
// development skips the login page entirely. Everywhere else this route does not exist.
export async function GET() {
  if (!getAuthSetup().devBypassEmail) return new Response("Not found", { status: 404 });
  try {
    await signIn("dev-bypass", { redirectTo: "/" });
  } catch (error) {
    if (error instanceof AuthError) redirect(`/login?error=${error.type}`);
    throw error;
  }
}
