# Adapting OrOv for your organization

OrOv is built so that an organization can run it as its own, under its own name and colors,
mostly through configuration. This guide walks through setting up a new instance and says where
configuration ends and changing code begins.

## Is it a fit?

OrOv is designed for **one organization per deployment**, with **one email domain**, **1–3
offices** and **fewer than about 250 people**. Within that range, search scans tables directly and
every view loads its whole data set at once. Larger organizations would need indexes, paging and
probably a different org chart layout, so plan for code changes above that size.

It is a **source of truth** for people, teams, reporting lines and seats, edited by admins in the
app or imported from spreadsheets. It doesn't book rooms or desks, and it doesn't sync from an HR
system yet.

## 1. Deploy it

The [README's Deployment section](../README.md#deployment) covers the Docker images and what the
database user needs. Set the required settings in [`configuration.md`](configuration.md):
`DATABASE_URL`, `AUTH_URL`, `AUTH_SECRET`, `COMPANY_DOMAIN`, `ADMIN_EMAILS` and `AUTH_PROVIDERS`.

## 2. Connect your sign-in

Pick the provider your organization already uses (Google Workspace, Microsoft Entra ID, Okta, AWS
Cognito or any OpenID Connect issuer), register OrOv as an application with the callback URL
`$AUTH_URL/api/auth/callback/<provider>`, and set its variables
([`configuration.md`](configuration.md#sign-in-providers)). The accounts in `ADMIN_EMAILS` become
admins when they first sign in; they can promote others.

## 3. Make it yours

Under **Admin → Branding**, import your design tokens from Figma, Penpot or Tokens Studio, or set
colors, fonts, the logo, the favicon and the app's name by hand. The contrast checks keep the
result readable. Each office can also have its own map colors. To start every new instance from
your brand, export the theme and point `THEME_TOKENS_PATH` at the file. The guide is
[`theming.md`](theming.md).

## 4. Draw your floors

Each floor is one SVG drawn in Figma, Illustrator or any vector editor, with element ids that mark
desks, rooms and areas (`desk-2-014`, `room-boardroom`, `area-south-wing`).
[`map-authoring.md`](map-authoring.md) explains the convention. Create the office and its floors
under **Admin → Offices & floors**, upload each drawing, and review what it adds before saving. Desks and
rooms can later be added, moved or removed in the browser. Each office chooses what its floors are
called (Floor, Building, Wing, …).

## 5. Bring in your people

Export your existing spreadsheets to CSV and import them under **Admin → Import & export**: teams first,
then people. The page lists the columns. Each import shows a dry run (what would be created,
changed, or rejected and why) before anything is written, and rows with errors can be skipped.
Files saved by Excel in any common encoding and separator are detected. Managers are matched by
email, so file order doesn't matter. Regions are ISO 3166 codes (`US`, `US-CA`, `CA-ON`).

After the import, edit people and teams in the app; export CSV at any time. Every admin change is in
the audit log.

To see a populated instance before your own data is in, load the demo organization: the
[README's "Try the demo"](../README.md#try-the-demo) explains how. It replaces whatever is there,
so use a new or test instance.

## 6. Decide on integrations

Chat shortcuts, room status and presence need a provider for your tools, and none ships yet. If you
want them, see [`integrations/README.md`](integrations/README.md): most of the work is shared, and
adding a provider for a tool is a contained piece of work in one folder. Presence is off by default
and private by design; agree its use with your people team before turning it on.

## What's configuration, and what's code

| You want to…                                  | How                                                                                     |
| --------------------------------------------- | --------------------------------------------------------------------------------------- |
| Change the name, logo, colors, fonts, density | Branding page or `THEME_TOKENS_PATH`; no code                                           |
| Use a different SSO provider                  | `AUTH_PROVIDERS` and its variables; any OIDC issuer works with `oidc`                   |
| Add offices, floors, rooms, people, teams     | Admin pages or CSV; no code                                                             |
| Show region names in another language         | Each user's **Settings** (23 languages for country names)                               |
| Connect a chat, calendar or room tool         | A provider in `packages/integrations/providers/<id>/` ([guide](integrations/README.md)) |
| Allow several email domains                   | Code: `canSignIn` in `packages/core/auth/policy.ts`                                     |
| Translate the interface                       | Code: interface text is English and not yet extracted for translation                   |
| Add a field to people                         | Code: schema, migration, form, CSV columns ([`CONTRIBUTING.md`](../CONTRIBUTING.md))    |

If you change code for your own use, keep it in a fork and consider sending the general parts back.

## Moving and backing up

**Admin → Backup** exports the whole organization as one passphrase-encrypted file, which another
instance on the same schema version can import (merging or replacing). Use it to set up a second
instance or to move hosts. It complements, and doesn't replace, your database's own backups.
