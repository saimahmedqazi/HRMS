# Onboarding dates and probation audit

| Severity | Affected paths | Reproduction and fix |
| --- | --- | --- |
| High | `employees.service.ts`, `approval-engine.service.ts`, employee onboarding and profile pages | Onboard an employee with a past hire date. The old service saved probation end 90 days after onboarding while leave eligibility used 90 days after the hire date. Manual onboarding now exposes the existing hire date field and uses the same calculation as leave. Older on-probation profiles derive the effective date from the recorded hire date. Profile and leave displays use UTC for these dates. |
| Medium | `employees.service.ts`, `bulk-import.service.ts` | Submit a nonexistent calendar date such as February 30. JavaScript and the spreadsheet parser accepted and shifted dates. Manual onboarding validates hire date and date of birth, and import validates ISO text before conversion. Actual Excel dates retain the worksheet day in both workbook date systems. |
| Medium | `employees.service.ts` | Submit a manual employee salary of zero. The old truthiness check discarded it and let payroll fall back to the salary package. Manual onboarding now stores zero as supplied. |

All 260 backend tests passed with the Asia/Karachi timezone. Both TypeScript checks and the frontend production build passed. Six focused Chromium tests passed against the running API, PostgreSQL, and Redis, including the updated onboarding flow and the profile response for an older inconsistent record. Historical hire dates already altered by a past import require the original source value to correct.
