# Bulk import credentials and spreadsheet download

| Severity | Affected files | Finding and fix |
| --- | --- | --- |
| Critical | `bulk-import.service.ts`, `password-policy.ts`, `auth.service.ts`, bulk import page | Successful bulk imports assigned the same password to all new accounts. Imported accounts now require password setup through the existing Forgot password flow. The retired password is rejected for sign-in, password reset, registration, and two-factor password confirmation. The portal explains how imported employees set their password. |
| High | `bulk-import.service.ts` | Preview loaded email addresses across the platform, and execution returned raw database diagnostics on a failed row. Preview now checks the importing company only. Execution still uses the database's global email uniqueness rule and returns a generic row error without the database diagnostic. |
| Medium | Bulk import controller, service, and page | The Download Sample Template link targeted a missing file. It now downloads an actual `.xlsx` file with the supported column headers through an HR- and Company Admin-only endpoint. |

Chromium downloaded and parsed the workbook, imported a synthetic employee, verified the account required password setup, and completed reset and sign-in. An employee received HTTP 403 when requesting the template. The recovery test used a disposable PostgreSQL token and the local mail configuration. Unit tests verified that pending setup and the retired credential cannot issue new session tokens. Existing client accounts and previously issued sessions require separate deployed-environment remediation.

The combined release regression passed 231 Jest tests and 131 Chromium tests. Both production builds, both TypeScript checks, and `git diff --check` passed. A production-mode API smoke verified the workbook MIME type and parsed the downloaded file.
