# Employee onboarding policy audit

| Severity | Affected paths | Reproduction and fix |
| --- | --- | --- |
| High | `bulk-import.service.ts`, `employees.service.ts`, `initialize-employee-policies.ts` | Set a company’s sick leave allowance to three days and disable annual leave. The old import created fourteen sick days and an annual balance. It also skipped the default shift assignment. Both onboarding paths now use one transaction-scoped initializer for active tenant leave settings and the company default shift. A backdated hire receives the same current-year initialization as a manual hire. |
| Medium | `leave.service.ts` | The first balance lookup previously initialized disabled leave types. It now creates missing balances for active settings only. |

Disposable PostgreSQL reproduced the incorrect imported records before editing. Six Chromium tests passed against the running API, PostgreSQL, and Redis. The bulk-import regression verified identical initial balances and shift assignments for one imported employee and three parallel manual hires, then checked that a balance lookup did not recreate the disabled leave type. Existing imported balances retain their recorded amounts and usage history. This change has no schema migration.
