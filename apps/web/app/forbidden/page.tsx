import Link from "next/link";

export default function Forbidden() {
  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-xl font-heading">Admins only</h1>
      <p className="mt-2 text-muted-fg">
        You don&apos;t have access to this page. Ask an admin if you need it.
      </p>
      <Link href="/" className="mt-4 inline-block text-sm underline">
        Back to home
      </Link>
    </main>
  );
}
