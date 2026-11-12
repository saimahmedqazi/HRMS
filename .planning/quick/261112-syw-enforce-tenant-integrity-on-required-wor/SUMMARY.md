# Required workforce relationships and tenant isolation

| Severity | Affected files | Finding and fix |
| --- | --- | --- |
| High | `schema.prisma`, `20261112040000_enforce_required_tenant_relationships/migration.sql` | PostgreSQL accepted required links based on a target ID alone. The affected paths include team departments, employee accounts, employee documents, attendance, timers, remote work, leave, resource requests, and payslips. The migration adds 11 composite foreign keys that require matching company IDs. Existing delete actions are preserved. The new keys restrict changes to referenced company and ID values so related records cannot move across companies through a cascading key update. |
| High | `resources.service.ts`, `resources.service.spec.ts` | Resource request creation resolved the department manager without checking the tenant. The service now checks the department's company and resolves a non-deleted employee in the requester's company before assigning or notifying a manager. |

The migration was applied both to an already seeded disposable PostgreSQL 16 database and as part of a fresh install. The before-and-after snapshot of employee, team, and leave request relationships matched. Prisma reported no schema drift in either database. The database test confirmed valid same-company writes, rejected cross-company department and requester changes, and blocked a company change to an account linked to an employee.

The migration is transactional and validates existing records. A client database containing inconsistent links will need those links reviewed before the migration can apply. This change covers required relationships where both sides already carry a company ID. Optional organization links, child tables that derive their tenant from a parent, and broader query-layer coverage remain separate audit items.

The full Chromium suite passed 128 tests on the migrated database before the final resource lookup change. The final backend passed 224 Jest tests, the production build, and TypeScript checks. Five Chromium regressions passed after restarting the final backend, covering resource creation, approval and fulfillment, concurrent decisions, the Operation Manager's scope, and the database relationship checks.
