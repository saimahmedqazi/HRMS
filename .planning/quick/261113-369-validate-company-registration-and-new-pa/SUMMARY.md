# Registration and password input audit

| Priority | Affected files | Reproduction and fix |
| --- | --- | --- |
| High | `auth.service.ts`, registration page, password recovery form | Submit a new password longer than 72 UTF-8 bytes through registration or reset. The previous validation accepted it despite bcrypt's input limit. Both forms explain the limit and the service rejects oversized inputs before database access. |
| Medium | `register-company.dto.ts`, registration page | Enter only spaces in the company or administrator name fields. The previous validators counted whitespace as input. Both validators now trim names, reject empty names, and require two characters for the company name. |

The backend suite passed 241 tests across 41 suites. Both TypeScript checks passed. The focused Chromium regression passed against the running frontend with an isolated unauthenticated session response. The first cold run timed out while Next.js compiled the pages. Full browser integration remains pending because the execution environment rejected launching the backend listener.

The email-verification mail method has no active caller. Current tenant registration creates a verified administrator directly and issues a session, so the absent verification page does not interrupt that registration flow. Manual employee creation still derives the next employee code from the employee count. Bulk imports can introduce a conflicting code, and concurrent creates can choose the same code. Reproduce against PostgreSQL before changing the allocator.
