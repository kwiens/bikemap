# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security vulnerabilities.

Report privately via GitHub's [private vulnerability reporting](https://github.com/kwiens/bikemap/security/advisories/new)
(the "Report a vulnerability" button on the repository's **Security** tab). If
that is unavailable, email the maintainer at kyle@ifixit.com.

Please include steps to reproduce and the affected version or commit. You can
expect an initial response within a few days.

## Scope

This is a client-side web app with no backend or user accounts. Recorded rides
and settings stay in the browser (IndexedDB / cookies). The most relevant
concerns are the Mapbox token configuration and third-party dependencies.

The Mapbox token is a **public** (`pk.*`) token and is meant to be exposed to
the browser — scope it to your domains in the Mapbox dashboard. Leaking it is
not a vulnerability in this project; an unscoped token is a misconfiguration.
