import { signInWithDevBypass } from "@/app/login/actions";
import { getAuthSetup } from "@/lib/auth-providers";

// The proxy sends signed-out requests here when AUTH_DEV_BYPASS_EMAIL is active, so local
// development skips the login page entirely. Everywhere else this route does not exist.
export async function GET() {
  if (!getAuthSetup().devBypassEmail) return new Response("Not found", { status: 404 });
  await signInWithDevBypass();
}
