---
status: complete
---

# Work timer restart and leave balance verification

| Severity | Confirmed defect and reproduction | Fix |
| --- | --- | --- |
| High | In Work Timer, stop after recording work, wait, restart, then stop again. The live counter and final attendance total previously included the interval when the timer was stopped. | The timer stores the active session's start separately and carries forward completed work in seconds. Both the browser and the API subtract only breaks that overlap the current session. The final attendance total uses the existing minute precision. |
| High | Submit two ordinary leave requests at the same time when the remaining balance covers only one. Each could pass the initial availability check, and the two increments could over-reserve the balance. First-use balance creation could also hit a duplicate key. | Reserve the days with a conditional database update in the same transaction as request creation and the approval notification. First-use balances are initialized without duplicate-key failures. A losing submission leaves no request or notification and triggers attachment cleanup if needed. |

The timer changes are in `work-timer.service.ts`, the attendance page, and the timer session migration. The balance changes are in `leave.service.ts`. Both fixes have automated regression coverage in the existing Playwright workflows.

## Verification

- **179 of 179 Jest tests** and **115 of 115 Chromium tests** passed. Both production builds and TypeScript checks passed.
- Fresh PostgreSQL 16 migration deployment and schema drift comparison passed. Upgrading a previous schema preserved a stopped timer's 27 recorded minutes across a restart and attendance synchronization.
- The browser displayed a timer's saved 20 minutes and 5 seconds, restarted it, and finalized attendance at 20 minutes despite a 90-minute stopped interval.
- Two concurrent browser API requests competing for a first-use 10-day balance produced one HTTP 201 and one HTTP 400. The saved balance held 10 pending days, and cancellation released those days.
- A separate PostgreSQL fixture confirmed that two competing auto-approved requests consumed the available days once, with zero pending days.

Earlier timer records preserve their stored totals. Restart timestamps were never recorded for pre-migration sessions, so stopped intervals in historical totals cannot be reconstructed from the available data. Overnight timer and punch completion remain outside this fix.

[PostgreSQL transaction isolation](https://www.postgresql.org/docs/16/transaction-iso.html#XACT-READ-COMMITTED)
