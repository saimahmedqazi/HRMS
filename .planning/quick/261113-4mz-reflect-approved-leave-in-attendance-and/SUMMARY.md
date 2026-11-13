# Approved leave in attendance

| Severity | Affected paths | Reproduction and fix |
| --- | --- | --- |
| High | `leave.service.ts` | Give a leave request final approval and inspect its dates in Attendance before the nightly job. A missing entry stayed blank and a system absence could remain in history. Final approval now records leave dates and converts eligible system absences in the same transaction as approval and balance settlement. Existing punches, holidays, weekends, and manually marked records are preserved. |
| Medium | `attendance.cron.ts` | The nightly job could update an unpunched row after a manual decision or concurrent leave approval. It now creates missing rows without overwriting them and converts only an existing system absence to approved leave. |

All 262 backend tests and backend typecheck passed. Seventeen focused Playwright tests passed against the local API and disposable PostgreSQL and Redis. A separate integration regression passed for automatic company-admin approval and executive approval of an HR request, including preservation of a holiday. Historical leave already approved before this change was not backfilled.
