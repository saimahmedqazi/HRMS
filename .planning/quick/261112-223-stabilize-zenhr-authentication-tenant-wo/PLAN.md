# ZenHR stabilization audit and plan

Audit date 2026-11-12. Baseline `8349c80` plus existing workspace edits. Both TypeScript checks and Prisma schema validation passed. Jest passed 159 tests across 32 suites. Playwright discovered 106 tests in 20 files. Neither lint script had a usable configuration. The separate backend Jest E2E script references a missing config. The read-only phase used schema validation and mocked tests. The later browser-run isolation incident is documented in [the verification summary](SUMMARY.md).

## System reviewed

- Next.js App Router with a server-provided navigation manifest, React Query, cookie-based requests, and role-specific dashboard routes.
- NestJS controller guards and Prisma service queries. The seven roles map to platform, company, department, team, and self scope. Login, refresh, password reset, TOTP, and Support Mode use separate paths.
- PostgreSQL models link companies to users, employees, departments, designations, teams, shifts, attendance, timers, leave, resource requests, payroll, subscriptions, notifications, and audit history. Many relations use a record ID foreign key alongside a separate tenant ID. Services must verify both sides when linking records. The standalone tenant extension is not wired into the injected Prisma service.
- Reviewed controllers and service paths for workforce CRUD, attendance, timer, leave approvals, payroll, bulk import, billing, support, notifications, storage, and Gemini. The implemented scheduled jobs use Nest Schedule and bulk import runs inside the request. The documented BullMQ architecture is a requirements gap.

## Prioritized findings from the read-only audit

| Severity | Status at baseline | Finding and affected files | Verification and recommended fix |
| --- | --- | --- | --- |
| Critical | Confirmed by inspection | Billing webhook does not verify the sender. `subscriptions.controller.ts`, `subscriptions.service.ts`, `main.ts`. | Trace webhook ingress to the first billing write. Require a valid Stripe signature over the raw request body and fail closed when configuration is missing. |
| Critical | Confirmed by inspection | Employee onboarding accepts platform roles. `create-employee.dto.ts`, `employees.service.ts`. | Compare the tenant onboarding role selector with the DTO and persisted user role. Enforce the same tenant-only role list at validation and service boundaries. |
| Critical | Confirmed by inspection | The active HTTP guard omits account-state and token-purpose checks. WebSocket admission independently trusts JWT claims. `jwt-auth.guard.ts`, `jwt.strategy.ts`, `auth.service.ts`, `attendance.gateway.ts`. | Compare admission checks across login, protected requests and sockets. Reject incomplete authentication and inactive accounts, use current role and company, and validate the recorded Support Mode session. |
| High | Confirmed by inspection | Employee details, document listing, and org charts lack manager scope. Employee and attendance list scope widens when the caller lacks a team or department. `employees.service.ts`, `data-scope.service.ts`, `attendance.service.ts`. | Compare a manager's directory and detail visibility before and after removing the assignment in a test fixture. Apply the same scope to queries and fail closed when an assignment is absent. |
| High | Confirmed by inspection | Leave balances can be requested for any tenant employee. Manager leave and resource lists are company-wide, and leave list/detail responses can contain restricted medical document URLs. `leave.controller.ts`, `leave.service.ts`, `resources.service.ts`. | Compare manager and employee result sets with assigned teams and the dedicated prescription authorization rules. Apply role scope to reads and consistently restrict medical attachments. |
| High | Confirmed by inspection | Department Manager team mutations verify tenant membership only. `teams.controller.ts`, `teams.service.ts`. | Compare department assignments for the actor and target team, including a team transfer. Require authorization in both departments and preserve company-wide administrator access. |
| High | Confirmed by inspection | Authenticated browser sessions expire instead of refreshing. `auth-context.tsx`, `api.ts`, `auth.service.ts`. | Wait until an access session expires and reload a protected page. Refresh once per browser context on protected 401 responses and retry the original request once. Correct refresh token fingerprinting and rotation. |
| High | Confirmed by inspection | A fresh deployment has no committed schema migration, and Render and Docker use a backend entry path inconsistent with the build. `apps/backend/prisma`, `render.yaml`, `apps/backend/Dockerfile`. | Build and check the emitted entry point. Apply versioned migrations in disposable PostgreSQL and document baselining for an existing database before wiring deployment. |
| Medium | Confirmed by inspection | Reset links point to a missing Next route. `mail.service.ts`, `app/forgot-password/page.tsx`. | Open the URL from a reset email in a fresh browser tab. Add the linked route using the existing reset form and keep the request and reset screens consistent. |
| Medium | Confirmed by inspection | Concurrent leave decisions can change balances more than once. Concurrent timer starts can create multiple active entries. `leave.service.ts`, `work-timer.service.ts`, `schema.prisma`. | Run concurrent normal workflow requests against a disposable database. Guard state transitions atomically and enforce timer uniqueness in PostgreSQL. |
| Medium | Confirmed by inspection | Missing storage credentials can return fake successful upload URLs and mask an integration failure. `storage.service.ts`. | Check upload and download with an isolated storage configuration. Restrict test simulation to non-production and require a real storage provider for production uploads. |
| Medium | Confirmed by tooling | Lint and backend E2E scripts are unusable as checked in. `apps/backend/package.json`, `apps/frontend/package.json`, `.github/workflows/ci.yml`. | Run lint in both workspaces and the backend E2E command. Configure non-mutating lint and use a real integration entry point. |

## Execution order

1. Close the billing and authentication boundaries. Add regression checks for valid and invalid admission paths.
2. Enforce role assignment and scope in workforce, leave, resource, and organization workflows. Verify legitimate self and manager access.
3. Restore password reset and browser session continuity. Verify normal browser and API workflows using disposable PostgreSQL and test-only configuration.
4. Record deployment, integration, and concurrency findings with evidence, including any fixes and checks still open. Run the full Jest suite and both typechecks again.
