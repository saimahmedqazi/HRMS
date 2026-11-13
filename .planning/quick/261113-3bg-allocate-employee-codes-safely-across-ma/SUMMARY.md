# Employee code allocation

| Severity | Affected paths | Reproduction and fix |
| --- | --- | --- |
| High | `employees.service.ts`, `bulk-import.service.ts`, `bulk-import-jobs.service.ts` | Import `EMP-002` as a tenant’s first employee and try to onboard another employee manually. PostgreSQL rejected the manual insert with a duplicate employee code. Two parallel manual requests could also derive the same code. The two workflows now lock the same company row inside their write transactions. Manual onboarding skips occupied codes, including soft-deleted records and case variants. A bulk row with a code claimed after preparation reports the specific field and row. |

Reproduced the original `P2002` in disposable PostgreSQL before editing. After the fix, live PostgreSQL and BullMQ checks verified the original case, four concurrent manual creates, a manual create waiting for a concurrent import, continued progress in a second tenant, and an import conflict report with no partial user. The backend typecheck, build, and all 242 Jest tests passed. The new Playwright API regression was discovered successfully. Running it through the application’s HTTP listener remains pending. The fix requires no migration.
