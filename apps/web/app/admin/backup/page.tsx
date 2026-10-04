import { BackupPanel } from "@/components/admin/backup-panel";

// Export the organization as one encrypted file, or load one (#29).
export default function BackupPage() {
  return (
    <div className="max-w-3xl space-y-2">
      <h1 className="text-xl font-heading">Backup and moving instances</h1>
      <p className="text-sm text-muted-fg">
        One file with the offices, floors and every drawing version, teams, people, users and their
        settings, and the themes. It&apos;s encrypted with a passphrase you choose, so it can be sent by
        email or kept on a shared drive. Messaging tokens, presence data and the audit log are never
        included. This complements the database&apos;s own backups; it doesn&apos;t replace them.
      </p>
      <BackupPanel />
    </div>
  );
}
