---
status: complete
---

# Overnight attendance and Work Timer

| Severity | Confirmed issue | Fix |
| --- | --- | --- |
| High | After tenant-local midnight, Daily Punch looked up only the new day. An employee could lose access to an open punch or create a second entry before finishing the shift. | Resolve the scheduled shift date. Keep the previous day's open punch visible to the employee dashboard and checkout, and reject a second punch while the original remains open. |
| High | Work Timer could lose an active session after midnight or synchronize work to the wrong day. Checkout also always used an eight-hour overtime threshold. | Keep the original date for timer actions and attendance totals. Both paths calculate overtime against the configured shift duration, with the existing eight-hour fallback. |
| High | The absence job could mark a night employee absent before the shift ended. A concurrent punch could also be overwritten by the job. | Classify overnight shifts after their local end time and condition updates on the record still having no punch. Preserve recorded holidays and weekends. |

The fixes are in `attendance-shift.ts`, `attendance.service.ts`, `work-timer.service.ts`, `analytics.service.ts`, and `attendance.cron.ts`. Daily Punch displays the shift date when it differs from the tenant's current calendar date.

## Verification

- **199 backend tests** and **117 Chromium tests** passed, along with both production builds and TypeScript checks.
- All five focused Chromium tests passed. The overnight case tested a late punch, the employee dashboard, rejection of a duplicate punch, timer pause and resume after the cutoff, timer finalization, and checkout. The fixture database held one record on the original shift date with the finalized timer total.
- The PostgreSQL job check used a tenant with a 45-minute UTC offset. Daytime absence was recorded after midnight, overnight absence was recorded after the shift ended, and an existing punch and a holiday were preserved.

Attendance location consent is a separate open finding. The schema has a `locationConsent` field, but the attendance page requests device coordinates before checking that preference and the backend currently accepts the coordinates without checking it.
