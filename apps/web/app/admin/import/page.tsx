import { CsvImportPanel } from "@/components/admin/csv-import-panel";
import { applyPeopleImport, applyTeamsImport, previewPeopleImport, previewTeamsImport } from "./actions";

export default function ImportPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-heading">Import &amp; export</h1>
        <p className="mt-1 text-sm text-muted-fg">
          Each import is a dry run first. Nothing is written until every row is valid, and every change is
          recorded in the audit log.
        </p>
        <p className="mt-2 text-sm">
          <a className="underline" href="/api/export/people">Export people CSV</a>
          {" · "}
          <a className="underline" href="/api/export/teams">Export teams CSV</a>
        </p>
      </div>

      <CsvImportPanel
        kind="teams"
        title="Teams"
        description="Columns: slug, name, parent_slug, slack_channel_id, color. Import teams before people, so memberships can refer to them."
        preview={previewTeamsImport}
        apply={applyTeamsImport}
      />

      <CsvImportPanel
        kind="people"
        title="People"
        description="Columns: email, name, preferred_name, title, home_region, home_timezone, phone, start_date, active, manager_email, desk, teams, primary_team. home_region is an ISO 3166 code for a country (US) or a subdivision (US-CA); files with the older home_country column still import. Teams are separated by semicolons. Each row is the full state of that person, so a blank cell clears the field. People who are not in the file are left alone."
        preview={previewPeopleImport}
        apply={applyPeopleImport}
      />
    </div>
  );
}
