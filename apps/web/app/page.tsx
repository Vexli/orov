import { requireUser } from "@/lib/session";
import { signOutAction } from "./actions";

export default async function Home() {
  const user = await requireUser();
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">OfficeOrg</h1>
      <p className="mt-2 text-neutral-600 dark:text-neutral-400">
        Signed in as {user.email} ({user.role}). Views arrive in later phases.
      </p>
      <form action={signOutAction} className="mt-4">
        <button type="submit" className="text-sm underline">
          Sign out
        </button>
      </form>
    </main>
  );
}
