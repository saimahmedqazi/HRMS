# Nightly attendance before hire date

**Severity: Medium.** `attendance.cron.ts` selected employees based on their current status and ignored the hire date. To reproduce, close November 10 for an Asia/Kathmandu company containing an employee hired that day, one hired on November 11, and a future hire. The previous job marked all three absent for November 10. The query now selects employees whose stored hire date is on or before the workday being closed.

A disposable PostgreSQL comparison reproduced the bug and confirmed first-day eligibility, exclusion of later hires, and idempotent reruns. The regression test covers the tenant date boundary. Existing attendance rows were preserved.
