# Security policy

OrOv holds an organization's people data: names, emails, phone numbers, reporting lines and where
people sit. Please report anything that could expose or change it.

## Reporting a vulnerability

Report privately through GitHub's **private vulnerability reporting**: on the repository, open the
**Security** tab and choose **Report a vulnerability**. Please don't open a public issue or pull
request for a vulnerability until a fix is released.

Include what an attacker could do, the steps to reproduce it, and the version or commit you tested.
You'll get an acknowledgement as soon as the maintainer sees it. Fixes are released as soon as
practical and credited to the reporter unless you'd rather not be named.

## Supported versions

Only the latest release receives security fixes while the project is in `0.x`.

## What's in scope

- Bypassing sign-in, the email-domain restriction, or the viewer/admin roles
- Reading or changing another person's data or settings without permission
- Script or style injection through floor drawings (SVG), design token files, logos, fonts, CSV
  imports or backup files
- Weaknesses in backup encryption

## How OrOv protects data

[`docs/architecture.md`](docs/architecture.md#security-model) describes the security model: SSO
limited to one domain, roles checked on every request, sanitized uploads, a strict grammar for theme
values, audited admin writes, encrypted backups, and security headers that forbid framing. One gap
is known and planned: the site-wide Content-Security-Policy doesn't restrict scripts yet
(`script-src`).

If you run OrOv, keep `AUTH_SECRET` and the database credentials in your host's secret store, use
your database's own backups and point-in-time recovery, and take a fresh encrypted export after each
upgrade that changes the schema.
