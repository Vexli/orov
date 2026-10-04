import { CsvImportPanel } from "@/components/admin/csv-import-panel";
import { applyPeopleImport, applyTeamsImport, previewPeopleImport, previewTeamsImport } from "./actions";

export default function ImportPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-heading">Import &amp; export</h1>
        <p className="mt-1 text-sm text-muted-fg">
          Each import is a dry run first. Nothing is written until every row is valid or skipped, and every
          change is recorded in the audit log.
        </p>
        <p className="mt-1 text-sm text-muted-fg">
          UTF-8 is preferred. Files saved by Excel (Windows-1252 &ldquo;CSV&rdquo;, or UTF-16
          &ldquo;Unicode Text&rdquo;) are detected, and you can change the encoding if names look
          wrong. Columns may be separated by commas, semicolons or tabs.
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
        description="Columns: slug, name, parent_slug, chat_channel_id (the team's channel in the chat tool; files with the older slack_channel_id column still import), color. Import teams before people, so memberships can refer to them."
        preview={previewTeamsImport}
        apply={applyTeamsImport}
      />

      <CsvImportPanel
        kind="people"
        title="People"
        description="Columns: email, given_name, family_name (blank for someone with a single name), preferred_name, title, home_region, home_timezone, phone, start_date, active, manager_email, desk, teams, primary_team, and the optional account columns github, gitlab, linkedin and website (a username or profile URL). Files with the older single name column still import: each name is split at its last space. home_region is an ISO 3166 code for a country (US) or a subdivision (US-CA); files with the older home_country column still import. home_timezone is an IANA time zone such as America/Toronto; left blank, a person with a desk gets the time zone of the desk's office. phone is read as a number in the home_region's country unless it starts with a country code (+44 …), and is stored in international form. Teams are separated by semicolons. Each row is the full state of that person, so a blank cell clears the field. A file without an account column leaves those accounts alone. People who are not in the file are left alone."
        preview={previewPeopleImport}
        apply={applyPeopleImport}
      />
    </div>
  );
}
