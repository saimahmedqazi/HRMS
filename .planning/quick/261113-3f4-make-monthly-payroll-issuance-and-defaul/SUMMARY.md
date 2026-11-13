# Payroll write audit

| Severity | Affected path | Reproduction and fix |
| --- | --- | --- |
| High | `payroll.service.ts` monthly execution | Run payroll with two employees and configure one calculated value to exceed the payslip storage precision. Before the fix, the earlier employee retained a payslip and notification after the later write failed. The monthly run now commits all payslips and notices in one transaction. |
| High | `payroll.service.ts` default structure replacement | Replace the default with a base salary exceeding storage precision. Before the fix, the failed creation left the old structure unmarked. Unmarking and creating now commit together. Default creation and replacement use the same tenant-scoped transaction lock. |
| Medium | `payroll.service.ts` payslip notices | Run payroll twice for the same period without changing net pay. Before the fix, the payslips stayed unique while the notices doubled. A rerun now issues a notice only for a first issuance or changed net pay. |

Disposable PostgreSQL reproduced all three issues before editing. After the fix, PostgreSQL verified four concurrent reruns, one default after concurrent initialization and replacement, preservation of the previous default after an invalid replacement, rollback of a failed new run and a failed recalculation, and a single notice for a corrected net amount. All 243 backend Jest tests, the backend build, and the backend typecheck passed. Changes are local. Hosted payroll verification remains open.
