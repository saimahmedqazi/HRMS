---
status: complete
---

# ZenHR stabilization verification

## QA database incident

During the first full browser run, I configured the API to use disposable PostgreSQL but omitted the database override for the Playwright process. Five existing specs created their own Prisma clients and inherited the workspace's remote database URL. Their setup hooks completed without a reported database error. The suite did not capture affected-row counts or pre-run snapshots.

- `e2e/09-work-timer-and-punch.spec.ts` issued tenant-wide attendance and work timer cleanup by date, with no company or employee filter. The date was 2026-11-11 UTC. Timer deletion can also remove related break records.
- `e2e/08-leave-lifecycle.spec.ts` could reset the seeded employee's used and pending leave balances and remove their leave requests starting December 1, 2026 or later.
- `e2e/10-workforce-and-org-management.spec.ts`, `e2e/12-resources-and-ai-assistant.spec.ts`, and `e2e/13-security-and-registration.spec.ts` ran cleanup matching workforce, resource, and registration fixture records.

Compare database audit records or a point-in-time copy from before the run to establish the impact before making any repair. The final Playwright run used an explicit loopback fixture connection and an API on the same disposable database. All direct fixture clients now require that explicit connection. Attendance and timer cleanup is restricted to the seeded employee and tenant.

## Changes and verification

| Area | Changes | Verification |
| --- | --- | --- |
| Authentication | HTTP and Socket.IO use the same live account validation. Protected requests reject incomplete authentication, inactive accounts, stale role claims, and ended Support Mode sessions. Refresh rotation verifies the full token and replaces it atomically. | JWT regression tests, seven-role browser login, Support Mode browser flow, live API checks for suspended-tenant access and refresh, and browser refresh-cookie recovery. Legacy refresh cookies require a fresh login once their current access session expires. |
| Workforce and role scope | Onboarding allows the tenant roles offered by the existing form. Employee directory, profiles, charts, and documents apply caller scope. Department managers can manage teams in their own department. Scoped managers receive only permitted compensation and identity fields. | Workforce CRUD and role suites, scope regression tests, and live two-tenant employee detail and department CRUD checks. |
| Leave, attendance, and resources | Scoped reads, medical URL redaction, scoped resource and remote approvals, self-approval guards, and conditional leave decisions. Timer creation and state changes are transactional. | Leave, attendance, timer, and resource browser workflows. On disposable PostgreSQL, concurrent leave decisions adjusted the balance once, concurrent timer starts produced one timer, and concurrent pauses produced one break. |
| Billing | Stripe events require a signature verified over the raw HTTP body. Missing configuration fails closed. | Signed and unsigned fixtures in Jest and a live HTTP check that an unsigned event is rejected. [Stripe webhook signature verification](https://docs.stripe.com/events/manage-webhook-endpoints#signature-errors) |
| Browser login and recovery | Login and registration wait for hydration, submit with POST semantics, and wait for session loading before navigation. Password reset emails open a working route. API and PDF traffic use the existing Next.js rewrite. | Login for all seven roles, browser registration and password reset, and an employee PDF download verified as an actual PDF stream. |
| Deployment and dependencies | Checked in a baseline schema migration, corrected backend entry points, documented deployment settings, prevented production uploads from returning simulated URLs, and updated Next.js to 15.5.29 and bcrypt to 6.0.0. | Both production builds and typechecks passed. The baseline applied to clean PostgreSQL 16 with zero schema drift. The production dependency audit went from 2 critical, 16 high, and 12 moderate entries to 0 critical, 13 high, and 13 moderate. [Next.js security advisory](https://nextjs.org/blog/CVE-2025-66478) |

## Test results

- Backend Jest passed **168 of 168 tests** across 33 suites.
- Final Playwright Chromium passed **108 of 108 tests** across 21 files on disposable PostgreSQL 16. The first full run passed 96 of 106. One failure reproduced a pre-hydration login bug. The other failures involved ambiguous selectors, assertions made before data loaded, shared attendance state, and obsolete platform resource expectations.
- Both TypeScript checks and both production builds passed. Prisma schema validation, baseline migration deployment, drift comparison, and `git diff --check` passed.
- The browser run used local mail, storage, Stripe, and Gemini configuration without live providers. Delivery, uploads, payment recovery, AI responses, and deployment remain unverified against those external services.
- The backend ESLint script lacks a flat config, the frontend lint command prompts for setup, and the separate backend Jest E2E script has no referenced config. The Playwright suite is the verified integration entry point.

## Open findings

| Severity | Evidence | Affected files | Recommended fix and verification |
| --- | --- | --- | --- |
| High | Confirmed by dependency audit | `package-lock.json`, `apps/backend/package.json` | Address remaining high findings, especially the spreadsheet parser and multipart stack. Run `npm audit --omit=dev` after compatible upgrades and retest the import and upload flows. The audit identifies affected dependency versions. Runtime reachability varies by advisory. |
| High | Confirmed by inspection | `subscriptions.service.ts`, `subscription-cron.service.ts` | The payment-success handler updates subscription state without clearing a billing-origin company suspension. Duplicate payment-failure deliveries increment the failure count again. Add idempotency and resume only tenants suspended for nonpayment. Verify duplicate delivery and billing recovery in a Stripe sandbox. |
| High | Confirmed by inspection | `app.module.ts`, `auth.controller.ts`, `attendance.controller.ts`, `main.ts` | The throttler is configured without an active guard. Forwarded IPs are read without a configured trusted-proxy chain. Configure route throttling and trusted IP extraction for the actual deployment. Verify rate limits, client IP handling, and CSRF behavior at the deployed ingress. |
| High | Source confirmed, deployed access unverified | `storage.service.ts`, `employees.service.ts`, `leave.service.ts` | Document delivery uses Cloudinary's default delivery type and stored URLs. Verify deployed ACLs and use authenticated assets and authorization-checked downloads for employee and medical documents. |
| High | Confirmed by inspection | `prisma.module.ts`, `prisma.service.ts`, `tenant-extension.ts`, `schema.prisma` | The tested tenant extension is disconnected from the injected client. Some relationships have only single-ID foreign keys. Add explicit tenant constraints and integrated coverage while preserving platform jobs and Support Mode. |
| Medium | Confirmed by inspection | `leave.service.ts` | New requests read availability before reserving it. Concurrent submissions can race even though approval and cancellation transitions are guarded. Make balance reservation atomic and verify concurrent submissions near the allocation limit. |
| Medium | Confirmed by inspection | `attendance.service.ts`, `analytics.service.ts`, `work-timer.service.ts` | Attendance and timer day keys use the server's local calendar while analytics uses UTC. Standardize tenant-day boundaries and verify around midnight and for overnight shifts. Verify how restarted timers should count time between stops. |
| Medium | Confirmed by inspection | `attendance.gateway.ts`, `work-timer.service.ts`, `auth.service.ts` | Existing sockets can retain their rooms until token expiry, and timer alerts pass employee identifiers to user rooms. Verify socket revocation and resolve recipient identifiers consistently. Decide whether password resets and logout must revoke existing access tokens immediately. |
| Medium | Confirmed by inspection | `bulk-import.service.ts`, `app.module.ts`, `.planning/REQUIREMENTS.md` | Bulk import runs within the HTTP request. The requirements specify a background job. Confirm that async import remains in release scope, then measure and verify large uploads on a staging worker. |
| Medium | Confirmed by tooling | `apps/backend/package.json`, `apps/frontend/package.json`, `.github/workflows/ci.yml` | Supply workspace lint configs and a working backend integration command, then wire the checks into CI. |
