---
status: complete
---

# Employee self-service profile editing

| Severity | Affected files | Issue and fix |
| --- | --- | --- |
| Medium | `employees/[id]/page.tsx` | Clearing an optional field omitted the value from the request, so the old value reappeared. The personal information editor sends changed fields only and uses null when a field is cleared. |
| Medium | `employees.service.ts`, `update-employee.dto.ts` | Self-service updates silently ignored HR-managed fields and accepted invalid dates of birth until the database write. The API checks the account and company at write time, rejects protected-field updates as a whole, and validates calendar dates and future dates. |
| Medium | `employees/[id]/page.tsx` | The edit button appeared on a reportee's profile for Team Leads who could view the profile. Employees now have a clear Edit Personal Information action on My Profile. HR and authorized admins can edit a reportee's demographics. |

Employees can edit phone number, address, city, country, date of birth, gender, and nationality. The existing profile photo, emergency contact, and document controls are available from the profile. Official name, work email, job details, and compensation follow the existing HR and administrator permissions.

The focused Chromium tests verified that edits persisted after reload, optional values cleared in PostgreSQL, invalid dates and protected fields were rejected, and employees could only edit their own profile. Team Lead contact and document actions continued to pass. Mobile Chromium verified the editor and scrollable action buttons at 320 and 390 pixels. Backend Jest passed 220 tests across 39 suites, and the full Playwright Chromium suite passed 123 tests on disposable PostgreSQL 16. Both production builds, both TypeScript checks, and `git diff --check` passed.
