import Link from "next/link";

// What a view shows on a new, empty instance (Phase 8): a new install starts with no people,
// offices or floors. Admins get the ways to fill it; everyone else is told it isn't set up yet.
export function GettingStarted({ title, isAdmin }: { title: string; isAdmin: boolean }) {
  return (
    <section aria-labelledby="getting-started" className="max-w-2xl">
      <h1 id="getting-started" className="text-xl font-heading">
        {title}
      </h1>
      {isAdmin ? (
        <div className="mt-4 rounded-lg border border-dashed border-border p-5 text-sm">
          <p>This instance is empty. To set it up:</p>
          <ol className="mt-3 list-decimal space-y-2 pl-5">
            <li>
              <Link href="/admin/locations" className="underline underline-offset-4">
                Add your offices
              </Link>{" "}
              and upload a drawing of each floor.
            </li>
            <li>
              <Link href="/admin/import" className="underline underline-offset-4">
                Import your teams and people
              </Link>{" "}
              from a spreadsheet, or add them one by one under Admin.
            </li>
          </ol>
          <p className="mt-4 text-muted-fg">
            To look around first, load the demo organization under{" "}
            <Link href="/admin/backup" className="underline underline-offset-4">
              Admin → Backup
            </Link>
            : choose Replace and upload <code>demo/orov-demo.json</code> from the OrOv repository,
            with the passphrase <code>orov-demo-data</code>.
          </p>
        </div>
      ) : (
        <p className="mt-4 rounded-lg border border-dashed border-border p-5 text-sm text-muted-fg">
          No one has been added yet. An admin sets OrOv up from the Admin pages.
        </p>
      )}
    </section>
  );
}
