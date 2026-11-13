# Leave accounting across calendar years

| Severity | Affected paths | Reproduction and fix |
| --- | --- | --- |
| High | `leave.service.ts`, Prisma schema and migration | Submit a request from December 31 to January 2. Previously all three days were charged to the start-year balance, even when the next year had no allowance. New requests reserve one day in December’s year and two in January’s year, atomically. Approval, rejection, and cancellation use the stored allocation. Pending requests created before the migration retain their original start-year accounting. |
| Medium | `approval-engine.service.ts` | Count March 8–10, 2026 under `America/New_York`. The old local-midnight subtraction counted two days. The calculation now uses UTC calendar dates and rejects invalid dates instead of accepting rollover. |

The migration applied to both a populated fixture and a fresh PostgreSQL database with no Prisma schema drift. All seven focused Chromium tests passed against the live API, PostgreSQL, and Redis. The cross-year regression verified rollback on insufficient January allowance, cancellation restoring both years, and final approval moving both years from pending to used.
