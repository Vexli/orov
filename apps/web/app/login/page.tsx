import { BrandMark } from "@/components/brand-mark";
import { getAuthSetup } from "@/lib/auth-providers";
import { getBrand } from "@/lib/theme";
import { signInWithDevBypass, signInWithDevPassword, signInWithProvider } from "./actions";

const MESSAGES: Record<string, string> = {
  AccessDenied: "Sign in with your company account to continue.",
  CredentialsSignin: "That email and password don't match.",
  Configuration: "Sign-in is not configured correctly. Ask an admin to check the server settings.",
};

const PRIMARY_BUTTON =
  "w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-fg hover:bg-primary/85";
const SECONDARY_BUTTON =
  "w-full rounded-md border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted";
const INPUT = "w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message = error ? (MESSAGES[error] ?? "Sign-in failed. Try again.") : null;
  const setup = getAuthSetup();
  const brand = await getBrand();

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-8">
      <div>
        <h1 className="text-2xl font-heading">
          <BrandMark brand={brand} className="h-10 w-auto" />
        </h1>
        <p className="mt-2 text-sm text-muted-fg">
          People, seats, teams and presence for our offices.
        </p>
      </div>
      {message ? (
        <p role="alert" className="rounded-md bg-accent p-3 text-sm text-accent-fg">
          {message}
        </p>
      ) : null}

      {setup.sso.map((provider) => (
        <form key={provider.id} action={signInWithProvider.bind(null, provider.id)}>
          <button type="submit" className={PRIMARY_BUTTON}>
            Sign in with {provider.name}
          </button>
        </form>
      ))}

      {setup.devPassword || setup.devBypassEmail ? (
        <section
          aria-labelledby="dev-sign-in"
          className="flex flex-col gap-3 rounded-md border border-dashed border-accent-fg p-4"
        >
          <h2 id="dev-sign-in" className="text-sm font-medium text-accent-fg">
            Local development only
          </h2>
          {setup.devPassword ? (
            <form action={signInWithDevPassword} className="flex flex-col gap-2">
              <label className="flex flex-col gap-1 text-sm">
                Email
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="username"
                  className={INPUT}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Password
                <input
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  className={INPUT}
                />
              </label>
              <button type="submit" className={SECONDARY_BUTTON}>
                Sign in with password
              </button>
            </form>
          ) : null}
          {setup.devBypassEmail ? (
            <form action={signInWithDevBypass}>
              <button type="submit" className={SECONDARY_BUTTON}>
                Continue as {setup.devBypassEmail}
              </button>
            </form>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
