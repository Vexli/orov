import { signInWithGoogle } from "./actions";

const MESSAGES: Record<string, string> = {
  AccessDenied: "Sign in with your company Google account to continue.",
  Configuration: "Sign-in is not configured correctly. Ask an admin to check the server settings.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message = error ? (MESSAGES[error] ?? "Sign-in failed. Try again.") : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">OfficeOrg</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          People, seats, teams and presence for our offices.
        </p>
      </div>
      {message ? (
        <p role="alert" className="rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          {message}
        </p>
      ) : null}
      <form action={signInWithGoogle}>
        <button
          type="submit"
          className="w-full rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          Sign in with Google
        </button>
      </form>
    </main>
  );
}
