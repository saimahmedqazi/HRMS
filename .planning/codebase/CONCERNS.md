# Codebase Concerns

**Analysis Date:** 2026-11-19

## Tech Debt

**Unwired Prisma tenant-isolation extension (`createTenantPrismaClient`):**
- Issue: `apps/backend/src/common/prisma/tenant-extension.ts` defines `createTenantPrismaClient()` to inject `companyId` filters automatically for `TENANT_MODELS`, and `apps/backend/src/common/request-context/request-context.middleware.ts` decodes the JWT into `AsyncLocalStorage` on every request, but `apps/backend/src/common/prisma/prisma.service.ts` extends plain `PrismaClient` directly and never wires `createTenantPrismaClient`. Additionally, the docblock in `tenant-extension.ts` claims automatic soft-delete (`deletedAt`) filtering, which is not implemented, `groupBy`/`$queryRaw`/`$executeRaw` are not intercepted, and newer models (`bulkImportJob`, `auditLog`) are absent from `TENANT_MODELS`.
- Why: Manual `companyId` and `deletedAt: null` filtering was added directly in services as modules matured, leaving the extension as dead infrastructure.
- Impact: Zero database-layer safety net against cross-tenant leakage or soft-deleted record leakage if a future query omits `companyId` or `deletedAt: null`, plus wasted per-request JWT verification overhead in `RequestContextMiddleware`.
- Fix approach: Either wire `createTenantPrismaClient` into `PrismaService` with complete `TENANT_MODELS`, `groupBy` support, and verified soft-delete semantics, or remove the dead extension and enforce tenant scoping with an ESLint/AST rule plus integration tests.

**Monolithic frontend pages and backend services:**
- Issue: Several core screens and services exceed 500–1,100 lines with mixed UI state, dialogs, forms, and API orchestration in single files:
  - Frontend: `apps/frontend/src/app/dashboard/attendance/page.tsx` (1,183 lines), `apps/frontend/src/app/dashboard/employees/[id]/page.tsx` (1,175 lines), `apps/frontend/src/app/dashboard/settings/page.tsx` (749 lines), `apps/frontend/src/app/dashboard/page.tsx` (588 lines), `apps/frontend/src/app/dashboard/leave/page.tsx` (510 lines), `apps/frontend/src/app/dashboard/payroll/page.tsx` (496 lines), `apps/frontend/src/app/dashboard/employees/page.tsx` (491 lines).
  - Backend: `apps/backend/src/modules/employees/employees.service.ts` (925 lines), `apps/backend/src/modules/auth/auth.service.ts` (789 lines), `apps/backend/src/modules/leave/leave.service.ts` (764 lines), `apps/backend/src/modules/attendance/attendance.service.ts` (603 lines), `apps/backend/src/modules/payroll/payroll.service.ts` (572 lines).
- Why: Rapid feature delivery across 15 modules and 7 roles consolidated sub-tabs, modals, and workflows into single route files and module services.
- Impact: High merge conflict rate, difficult code review, bloated client page chunks, and fragile state transitions when modifying one tab or workflow.
- Fix approach: Extract tab panels and dialogs into feature-scoped components under `apps/frontend/src/components/<feature>/`, and split large backend services by responsibility (e.g., `employees-documents.service.ts`, `auth-totp.service.ts`, `leave-approval.service.ts`).

**Pervasive `any` casts and unvalidated DTO interface:**
- Issue: Despite `strict: true`, `any` is heavily used in core files: `apps/backend/src/common/prisma/tenant-extension.ts` (28 occurrences), `apps/frontend/src/app/dashboard/employees/[id]/page.tsx` (16), `apps/backend/src/modules/leave/leave.controller.ts` (11), `apps/backend/src/modules/payroll/payroll.controller.ts` (9), `apps/frontend/src/app/dashboard/attendance/page.tsx` (8), `apps/frontend/src/app/dashboard/settings/page.tsx` (6), and `apps/backend/src/modules/resources/resources.controller.ts` (4). Separately, `UpdateCompanySettingsDto` in `apps/backend/src/modules/companies/companies.service.ts` is declared as a TypeScript `interface` rather than a `class` with `class-validator` decorators.
- Why: Controllers typed `@CurrentUser() user: any` instead of `AuthenticatedUser`, and frontend views cast API responses inline.
- Impact: Weakens compile-time checks on tenant/user shapes and bypasses NestJS global `ValidationPipe` on `PATCH /api/v1/companies/me`.
- Fix approach: Replace `@CurrentUser() user: any` with `AuthenticatedUser`, convert `UpdateCompanySettingsDto` to a validated DTO class, and introduce shared response types for frontend pages.

**Unused dependencies, misclassified dev packages, and inert config validation:**
- Issue:
  - `apps/backend/package.json` installs legacy `bull` (`^4.16.3`) and `@nestjs/bull` (`^10.2.1`) alongside `bullmq` (`5.81.5`), even though only `bullmq` is imported (`apps/backend/src/modules/bulk-import/bulk-import-jobs.service.ts`).
  - `@types/pdfkit` is listed in runtime `dependencies` in `apps/backend/package.json`, and `@tanstack/react-query-devtools` is in runtime `dependencies` in `apps/frontend/package.json` (unused in `apps/frontend/src/lib/query-provider.tsx`).
  - `apps/backend/src/app.module.ts` passes `validationOptions: { allowUnknown: false, abortEarly: false }` to `ConfigModule.forRoot()` without a `validationSchema`, making the option completely inert.
- Why: Incremental stack migration from Bull to BullMQ and package installations without pruning.
- Impact: Unnecessary install size, expanded transitive vulnerability surface, and silent startup misconfigurations for optional env vars.
- Fix approach: Remove `bull` and `@nestjs/bull`, move `@types/pdfkit` and `@tanstack/react-query-devtools` to `devDependencies` (or remove unused devtools), and add a real schema validator to `ConfigModule.forRoot()`.

**Repository root clutter and untracked local artifacts:**
- Issue: The repository root contains stray scratch/handoff artifacts (`gemini-code-1792956186949.md` through `gemini-code-1792956224235.md`, `pexels-dominykas-sen-25433404-6858306.jpg` [2.37 MB], `tmp/` containing CI zip archives and `production-checkout-entry.cjs`, `output/`, `req.docx`, duplicate `ZenHR_Client_Release_Handoff.docx`/`.pdf`, `UAT_DEFECT_AUDIT.md`) plus untracked `apps/frontend/tsconfig.tsbuildinfo` changes. Only `gemini-code-*.md` is listed in `.gitignore`; `tmp/`, `output/`, and `*.tsbuildinfo` are not ignored.
- Why: Ad-hoc UAT verification, diagram/PDF generation, and CI artifact downloads were stored in the repo root.
- Impact: Risk of accidentally committing large binaries or scratch scripts to Git and bloating Docker build contexts (`docker build` uses repo root `.`).
- Fix approach: Remove scratch files/binaries from root, archive client handoff docs under `docs/`, and add `tmp/`, `output/`, and `*.tsbuildinfo` to `.gitignore` and `.dockerignore`.

## Known Bugs

**14-day trial expiration is never enforced or transitioned:**
- Symptoms: Companies created with `SubscriptionStatus.TRIALING` and a 14-day `trialEnd` continue accessing the platform indefinitely after `trialEnd` passes.
- Trigger: Wait until `subscription.trialEnd < new Date()` on a `TRIALING` company and call any guarded API route.
- Files: `apps/backend/src/modules/subscriptions/subscriptions.service.ts` (lines 56–67), `apps/backend/src/common/guards/subscription-tier.guard.ts` (lines 42–57), `apps/backend/src/modules/subscriptions/subscription-cron.service.ts`.
- Workaround: Manual company suspension by Super Admin via `PATCH /api/v1/super-admin/companies/:id/status`.
- Root cause: `SubscriptionTierGuard` checks only `status === SubscriptionStatus.SUSPENDED` and `tier`, ignoring `trialEnd`, `CANCELLED`, and `PAST_DUE`. `SubscriptionCronService` processes `PAST_DUE` retries and 60-day lockouts, with no job transitioning expired trials.
- Blocked by: Product decision noted in `UAT_DEFECT_AUDIT.md` on post-trial behavior (auto-downgrade to Basic vs. soft lock vs. suspension).

**Premium feature gates and Basic 25-employee cap are not enforced on several endpoints:**
- Symptoms: `BASIC`-tier companies can run Bulk Excel Imports, upload employee documents, and onboard more than 25 employees despite the feature manifest returned by `GET /api/v1/subscriptions/current` (`bulkDataImport: false`, `documentUploads: false`, `maxEmployees: 25`). Furthermore, `WorkTimerService` checks `company.subscriptionTier` instead of `Subscription.status`, so a `SUSPENDED` subscription with `company.subscriptionTier === PREMIUM` is not blocked at the timer layer unless the company itself is suspended.
- Trigger: Authenticate as a `BASIC`-tier `COMPANY_ADMIN` or `HR_MANAGER` and call `POST /api/v1/employees/bulk/execute`, `POST /api/v1/employees/:id/documents`, or onboard a 26th employee via `POST /api/v1/employees`.
- Files: `apps/backend/src/modules/subscriptions/subscriptions.service.ts` (lines 145–157), `apps/backend/src/modules/bulk-import/bulk-import.controller.ts`, `apps/backend/src/modules/employees/employees.controller.ts` (line 209), `apps/backend/src/modules/employees/employees.service.ts` (lines 230–351), `apps/backend/src/modules/bulk-import/bulk-import.service.ts` (lines 198–267), `apps/backend/src/modules/work-timer/work-timer.service.ts` (lines 50–62).
- Root cause: `SubscriptionTierGuard` + `@RequireSubscriptionTier(SubscriptionTier.PREMIUM)` is only attached to `apps/backend/src/modules/ai-assistant/ai-assistant.controller.ts`. No guard is applied to `BulkImportController` or `uploadDocument`, and no active headcount check exists inside `onboardEmployee` or `importEmployee`.
- Fix: Attach `SubscriptionTierGuard` + `@RequireSubscriptionTier(SubscriptionTier.PREMIUM)` to `BulkImportController`, `WorkTimerController`, and `uploadDocument` (where required by tier rules), and enforce the 25-employee limit inside the `lockEmployeeOnboarding` transaction in `employees.service.ts` and `bulk-import.service.ts`.

**Stripe Customer Portal cancellations and plan changes do not sync to the database:**
- Symptoms: If a tenant cancels their Premium subscription or changes plans in the Stripe Customer Portal, ZenHR continues treating the tenant as `ACTIVE` + `PREMIUM`.
- Trigger: Open Customer Portal via `POST /api/v1/subscriptions/portal-session` and cancel the subscription; Stripe sends `customer.subscription.deleted` / `customer.subscription.updated`.
- Files: `apps/backend/src/modules/subscriptions/subscriptions.service.ts` (lines 262–268).
- Root cause: `handleWebhookEvent()` returns `{ received: true }` early for every event except `checkout.session.completed`, `invoice.payment_succeeded`, and `invoice.payment_failed`.
- Fix: Handle `customer.subscription.updated` and `customer.subscription.deleted` in `handleWebhookEvent()` to sync `status`, `tier`, `cancelAtPeriodEnd`, `currentPeriodStart`, and `currentPeriodEnd`, and update `Company.subscriptionTier`.

**Backend `attendance_exception` WebSocket event is never consumed by the frontend:**
- Symptoms: Real-time HR notifications for unauthorized remote/IP check-in exceptions rely on the 30-second HTTP notification poll rather than instant WebSocket delivery.
- Trigger: Trigger an unauthorized check-in exception; `AttendanceGateway.broadcastAttendanceException()` emits `attendance_exception` to room `hr_${companyId}`, while the frontend socket ignores it.
- Files: `apps/backend/src/modules/attendance/attendance.gateway.ts` (lines 107–109), `apps/frontend/src/components/layout/header.tsx` (lines 64–65).
- Root cause: `Header` registers listeners only for `attendance_ready` and `break_alert`, omitting `attendance_exception`.
- Fix: Subscribe to `attendance_exception` in `apps/frontend/src/components/layout/header.tsx` to invalidate both `['notifications']` and attendance exception queries.

**Unverified hosted production write flows and historical D-03 attendance row (`UAT_DEFECT_AUDIT.md`):**
- Symptoms: While automated Playwright E2E specs (`e2e/15-client-uat.spec.ts`) pass in CI, live production verification on Acme was restricted to read-only Support Mode. Live write paths (D-01, D-04, D-05, D-08–D-11), live Cloudinary signed PDF delivery (D-07), hosted AI chat for commit `4a18a5f` generic pay intents, and historical production `workMinutes` data integrity for D-03 remain unverified against production infrastructure.
- Files: `UAT_DEFECT_AUDIT.md`, `apps/backend/src/common/storage/storage.service.ts`, `apps/frontend/src/lib/attendance-duration.ts`.
- Workaround: Provision a disposable non-customer hosted tenant to execute write-path and Cloudinary PDF sign-off checks.

## Security Considerations

**WebSocket CORS reflects arbitrary origins with credentials (CSWSH risk):**
- Risk: `AttendanceGateway` configures `cors: { origin: true, credentials: true }`, reflecting any untrusted `Origin` header with credentials allowed. A malicious third-party site visited by an authenticated HR Manager or Company Admin could connect to `/ws/attendance` via cookie auth and receive `attendance_exception` payloads containing employee names, IP addresses, and check-in timestamps.
- Files: `apps/backend/src/modules/attendance/attendance.gateway.ts` (lines 23–29, 107–109).
- Current mitigation: `access_token` cookies currently use `sameSite: 'lax'` (`apps/backend/src/modules/auth/auth.controller.ts` line 228), which blocks cross-site cookie attachment on standard requests in modern browsers, and `break_alert` sends no payload. However, `origin: true` violates defense-in-depth and breaks immediately if `sameSite` is ever changed to `'none'` or if a same-site subdomain is compromised.
- Recommendations: Restrict Socket.IO CORS `origin` to the configured `FRONTEND_URL` (matching HTTP CORS in `apps/backend/src/main.ts`) and verify `client.handshake.headers.origin` inside `handleConnection`.

**Missing CSRF protection on cookie-authenticated state-changing endpoints:**
- Risk: Authentication relies on `httpOnly` cookies (`access_token`, `refresh_token`), and `apps/backend/src/main.ts` (line 52) lists `'X-CSRF-Token'` in CORS `allowedHeaders`, yet no CSRF token generation or verification middleware exists anywhere in the backend or frontend. Endpoints accepting `multipart/form-data` (avatar, document, bulk import uploads) or simple form posts could be targeted if cookie `SameSite` policy is weakened or same-site subdomain takeover occurs.
- Files: `apps/backend/src/main.ts` (lines 48–53), `apps/backend/src/modules/auth/auth.controller.ts` (lines 222–258), `apps/frontend/src/lib/api.ts`.
- Current mitigation: `sameSite: 'lax'` cookies, `Origin` restricted to `FRONTEND_URL`, and JSON `Content-Type` preflight on most endpoints.
- Recommendations: Implement double-submit cookie or synchronizer CSRF token validation (or strict `Origin`/`Sec-Fetch-Site` verification middleware) on all mutating routes (`POST`, `PUT`, `PATCH`, `DELETE`) except public webhooks.

**Unvalidated `PATCH /api/v1/companies/me` payload (`UpdateCompanySettingsDto`):**
- Risk: Because `UpdateCompanySettingsDto` is a TypeScript `interface` (`apps/backend/src/modules/companies/companies.service.ts` lines 4–14), NestJS `ValidationPipe` skips runtime validation entirely. `companies.service.ts` allowlists property keys manually, but never validates types, lengths, or URL schemes for `logoUrl`, `website`, `name`, `phone`, `address`, `industry`, `size`, or `locale`. An admin/HR user could persist a `javascript:` URI or arbitrary external URL in `logoUrl`/`website` or send malformed types causing Prisma runtime errors.
- Files: `apps/backend/src/modules/companies/companies.controller.ts` (lines 34–46), `apps/backend/src/modules/companies/companies.service.ts` (lines 4–14, 42–83).
- Current mitigation: Role guard restricts route to `SUPER_ADMIN`, `COMPANY_ADMIN`, `HR_MANAGER`; `timezone` is validated with `Intl.DateTimeFormat`.
- Recommendations: Convert `UpdateCompanySettingsDto` into a class decorated with `@IsOptional()`, `@IsString()`, `@MaxLength()`, and `@IsUrl({ protocols: ['https'], require_protocol: true })` for `website` and `logoUrl`.

**Public Swagger documentation exposed in production:**
- Risk: `SwaggerModule.setup('api/docs', ...)` is unconditionally mounted in `apps/backend/src/main.ts` (lines 76–100) regardless of `NODE_ENV`, publicly advertising every API path, DTO schema, and internal admin endpoint (such as `/api/v1/super-admin/platform-accounts/operation-manager/reset-password`).
- Files: `apps/backend/src/main.ts` (lines 76–100), `.github/workflows/ci.yml` (line 116 polls `/api/docs` as readiness check).
- Current mitigation: Endpoints themselves remain behind `JwtAuthGuard` and `RolesGuard`.
- Recommendations: Disable Swagger in production (`nodeEnv !== 'production'`) or gate it behind admin auth, and expose a dedicated lightweight `/api/v1/health` readiness endpoint for CI and Render/Railway probes.

**File upload validation relies solely on client-supplied MIME headers:**
- Risk: `StorageService.uploadFile()` checks `allowedMimes.includes(file.mimetype)` without inspecting magic bytes (`file.buffer`). A user can upload an HTML/SVG/executable payload disguised with `Content-Type: application/pdf` or `image/png`.
- Files: `apps/backend/src/common/storage/storage.service.ts` (lines 81–93).
- Current mitigation: Multer file size limits (5–10 MB), authenticated Cloudinary delivery for private documents/prescriptions, and short-lived signed download URLs (`expires_at: +60s`).
- Recommendations: Verify actual binary file signatures (e.g., via `file-type` already present in dependency overrides) before streaming to Cloudinary, and reject mismatched extensions/magic bytes.

**Plaintext storage of password reset tokens and sensitive employee PII/financial fields:**
- Risk:
  - `passwordResetToken` and `emailVerifyToken` are stored unhashed in `users` (`apps/backend/src/modules/auth/auth.service.ts` lines 395–404, 452–461). Any database read exposure or backup leak yields directly usable reset links.
  - `Employee.bankAccountNumber`, `Employee.nidNumber`, and `Employee.taxId` are stored as plaintext strings (`apps/backend/prisma/schema.prisma` lines 343–347), unlike `twoFaSecret` which uses AES-256-GCM encryption (`apps/backend/src/modules/auth/totp-secret.ts`).
- Files: `apps/backend/src/modules/auth/auth.service.ts`, `apps/backend/prisma/schema.prisma`.
- Current mitigation: Reset tokens expire after 1 hour; `employees.service.ts` strips sensitive fields for non-HR/Admin roles (`omitSensitiveEmployeeFields`).
- Recommendations: Store SHA-256 hashes of `passwordResetToken` and `emailVerifyToken` (matching `refreshTokenHash`), and consider envelope encryption for `bankAccountNumber`, `nidNumber`, and `taxId`.

**Weak temporary passwords and missing forced password rotation on onboarding:**
- Risk: `EmployeesService.onboardEmployee()` generates temporary passwords using only 3 random bytes (`ZenHR@${crypto.randomBytes(3).toString('hex')}!` = 24 bits of entropy), hashes them with cost factor `10` instead of configured `app.security.bcryptRounds` (`12`), returns `tempPassword` directly in the HTTP JSON response, and sets no `mustChangePassword` flag forcing rotation at first login.
- Files: `apps/backend/src/modules/employees/employees.service.ts` (lines 294–295, 354–379).
- Current mitigation: Per-account 5-attempt lockout in `auth.service.ts`.
- Recommendations: Replace plaintext temporary passwords with `PASSWORD_SETUP_REQUIRED` + a time-limited, hashed password-setup email token (matching the bulk-import security model), or use >=16 bytes of entropy, `bcryptRounds` from config, `Cache-Control: no-store`, and mandatory first-login password change.

**Login rate-limiting gap and state-changing `GET /auth/verify-email`:**
- Risk: `POST /api/v1/auth/login` in `apps/backend/src/modules/auth/auth.controller.ts` (lines 57–62) has no route-specific `@Throttle` decorator (unlike `register`, `login/2fa`, `forgot-password`, and `reset-password` which cap at 15 req/min), inheriting the global 60 req/min limit and permitting faster distributed credential stuffing across multiple accounts. `GET /api/v1/auth/verify-email` (line 149) mutates verification state on a GET request, which email security scanners can pre-fetch and consume.
- Files: `apps/backend/src/modules/auth/auth.controller.ts` (lines 57–77, 148–154).
- Current mitigation: 5-attempt per-account 15-minute lockout in `auth.service.ts`.
- Recommendations: Add `@Throttle({ short: { limit: 15, ttl: 60000 } })` to `POST /auth/login` and move email verification to a `POST` endpoint triggered by a frontend confirmation page.

**Unescaped HTML interpolation in outbound email templates:**
- Risk: User-controlled or external strings (`dto.firstName`, `employeeName`, Stripe `reason`) are interpolated raw into HTML email bodies (`apps/backend/src/modules/employees/employees.service.ts` line 359, `apps/backend/src/common/mail/mail.service.ts` line 135, `apps/backend/src/modules/subscriptions/subscription-cron.service.ts` line 87), permitting HTML injection/phishing content inside official ZenHR emails.
- Files: `apps/backend/src/common/mail/mail.service.ts`, `apps/backend/src/modules/employees/employees.service.ts`, `apps/backend/src/modules/subscriptions/subscription-cron.service.ts`.
- Current mitigation: None on HTML interpolation.
- Recommendations: HTML-escape all dynamic variables before inserting into email templates.

**Client-side only dashboard route gating and `'unsafe-inline'` CSP:**
- Risk: `apps/frontend/src/middleware.ts` only matches `/api/:path*` (for HMAC IP forwarding). All `/dashboard/*` authentication and module checks occur client-side in `apps/frontend/src/app/dashboard/layout.tsx`, meaning route JS bundles are served before redirect. Additionally, `apps/frontend/next.config.ts` (line 31) sets `script-src 'self' 'unsafe-inline'`, weakening XSS mitigation.
- Files: `apps/frontend/src/middleware.ts`, `apps/frontend/src/app/dashboard/layout.tsx`, `apps/frontend/next.config.ts`.
- Current mitigation: All tenant data is fetched from authenticated NestJS APIs guarded by `JwtAuthGuard`, `RolesGuard`, and `DataScopeService`; no `dangerouslySetInnerHTML` sinks exist in `apps/frontend/src/`.
- Recommendations: Check for presence of the `access_token`/`refresh_token` cookie in `middleware.ts` to redirect unauthenticated `/dashboard/*` requests at the edge, and evaluate nonce-based CSP for production builds.

## Performance Bottlenecks

**Hourly absence cron executes N+1 sequential queries per employee:**
- Problem: `AttendanceCronService.handleNightlyAbsenceJob()` iterates sequentially over every active company due for shift cutoff, then executes 3–4 sequential Prisma queries (`attendanceRecord.findUnique`, `leaveRequest.findFirst`, `remoteWorkPermission.findFirst`, `updateMany`/`createMany`) per employee inside a `for` loop.
- Files: `apps/backend/src/modules/attendance/attendance.cron.ts` (lines 34–128).
- Measurement: At 1,000 employees sharing a common timezone (e.g., `UTC` or `Asia/Karachi` midnight cutoff), a single hourly tick issues 3,000–4,000 sequential database round-trips (~15–40s+ over hosted network latency).
- Cause: Per-employee lookups inside nested loops instead of bulk pre-fetching existing attendance records, approved leaves, and approved remote permissions per company/date.
- Improvement path: Batch-query `attendanceRecord`, `leaveRequest`, and `remoteWorkPermission` once per company using `employeeId: { in: employeeIds }`, compute missing rows in memory, and execute a single `createMany({ skipDuplicates: true })` / `updateMany`.

**Payroll run executes sequential per-employee upserts and notifications inside one transaction:**
- Problem: `PayrollService.writePayrollRun()` loops over all active/probation employees and executes an individual `tx.payslip.upsert()` (with nested `include` joins) plus `tx.notification.create()` per employee inside a single 60-second advisory-locked transaction (`PAYROLL_TRANSACTION`).
- Files: `apps/backend/src/modules/payroll/payroll.service.ts` (lines 15, 199–310).
- Measurement: 2 sequential DB round-trips per employee inside one transaction; at ~300–500 employees over hosted Postgres latency, the run approaches the 60,000ms transaction timeout and holds the company payroll advisory lock for the entire duration.
- Cause: Per-employee ORM `upsert` and `notification.create` inside a synchronous HTTP request transaction.
- Improvement path: Batch notification inserts via `tx.notification.createMany()`, omit unnecessary nested `include` joins during writes (fetch once after commit), and offload large payroll runs (>200 employees) to a BullMQ background job.

**Unpaginated `findMany` queries on growing transactional tables:**
- Problem: Only `employees.service.ts` (`listEmployees`, capped at `limit <= 100`) and `notifications.controller.ts` (`take: 50`) paginate results. Other core endpoints return unbounded result sets:
  - `apps/backend/src/modules/attendance/attendance.service.ts`: `listAttendanceRecords()` (line 308), `listExceptions()` (line 330), `listRemoteWorkPermissions()` (line 436)
  - `apps/backend/src/modules/leave/leave.service.ts`: `getLeaveRequests()` (line 525)
  - `apps/backend/src/modules/payroll/payroll.service.ts`: `getPayslips()` (line 434), `exportPayrollCsv()` (line 535)
  - `apps/backend/src/modules/resources/resources.service.ts`: `getResourceRequests()` (line 117)
  - `apps/backend/src/modules/super-admin/super-admin.service.ts`: `listCompanies()` (line 23)
  - `apps/backend/src/modules/analytics/analytics.service.ts`: `getSuperAdminMetrics()` (line 53)
  - `apps/backend/src/modules/subscriptions/subscriptions.service.ts`: `getSubscription()` platform branch (line 90)
- Cause: List endpoints were implemented without `page`/`limit` query DTOs.
- Improvement path: Add standardized cursor or `page`/`limit` pagination (with max cap e.g. 100) and default date-range windows on attendance and payslip queries.

**Forced HTTP long-polling for Socket.IO plus 30s notification polling and duplicate JWT verification:**
- Problem: `apps/frontend/src/components/layout/header.tsx` (lines 57–61, 82) forces Socket.IO to `transports: ['polling']` through Next.js rewrites (`/api/attendance-events`) AND polls `GET /api/v1/notifications` every 30 seconds. On the backend, every authenticated HTTP request verifies the `access_token` JWT twice: once in `RequestContextMiddleware` (`apps/backend/src/common/request-context/request-context.middleware.ts` line 34) and again in `JwtStrategy` (`apps/backend/src/modules/auth/strategies/jwt.strategy.ts`), which also runs a DB `user.findUnique` on every request (and an additional `supportModeSession.findFirst` in Support Mode).
- Cause: Next.js Vercel rewrites do not proxy WebSocket upgrades, so long-polling was used as a workaround; `RequestContextMiddleware` was originally added for the unwired Prisma tenant extension and throttler user-keying.
- Improvement path: Connect Socket.IO directly to the backend WebSocket origin (with strict CORS and short-lived WS auth ticket) to enable native WebSockets, increase or pause notification polling while connected, and cache short-lived session validation metadata in Redis if request volume grows.

**Synchronous in-request email delivery:**
- Problem: `MailService.sendMail()` (8-second timeout) is awaited directly inside HTTP request handlers such as `EmployeesService.onboardEmployee()` (`apps/backend/src/modules/employees/employees.service.ts` line 354) and `AuthService.forgotPassword()` (`apps/backend/src/modules/auth/auth.service.ts` line 406), as well as Stripe webhook processing (`apps/backend/src/modules/subscriptions/subscriptions.service.ts` line 395).
- Cause: Email sending is not queued through BullMQ.
- Improvement path: Dispatch emails asynchronously via a BullMQ `mail` queue with exponential backoff retries so HTTP endpoints respond immediately and transient SMTP/Resend outages do not drop messages.

## Fragile Areas

**Uncommitted payroll worktree changes and broken Railway GitHub auto-deploy:**
- Files: `apps/backend/prisma/schema.prisma`, `apps/backend/prisma/migrations/20261117000000_assign_payroll_structures/migration.sql`, `apps/backend/src/modules/payroll/*`, `apps/backend/src/modules/employees/*`, `apps/frontend/src/app/dashboard/payroll/page.tsx`, `apps/frontend/src/app/dashboard/employees/[id]/page.tsx`, `render.yaml`, `UAT_DEFECT_AUDIT.md`.
- Why fragile: As documented in `UAT_DEFECT_AUDIT.md`, there are 21 modified tracked files and an unapplied migration (`20261117000000_assign_payroll_structures`) sitting uncommitted in the local worktree that are NOT in the deployed Railway backend. Furthermore, `render.yaml` targets Render, while actual production runs on Railway where GitHub auto-deploy currently fails to load branches and requires manual snapshot deploys.
- Common failures: Deploying the uncommitted backend code without first configuring Railway's Pre-deploy Command to `npm run prisma:migrate:deploy --workspace=apps/backend` will crash payroll/employee endpoints on missing `payrollStructureId` and `currencyCode` columns.
- Safe modification: Commit and CI-verify the payroll structure work on a clean branch, configure Railway's pre-deploy migration command, repair Railway GitHub integration (or automate deployment from GitHub Actions), and align `render.yaml`/deployment docs with actual hosting.
- Test coverage: Local unit tests (57/57) and a mocked-API UI test passed, but full PostgreSQL migration + E2E persistence against the new schema has not run in CI yet.

**Prisma composite `onDelete: SetNull` relations referencing non-nullable `companyId`:**
- File: `apps/backend/prisma/schema.prisma` (lines 268, 309, 357–360, 816).
- Why fragile: Seven tenant-scoped optional relations (`Department.manager`, `Team.lead`, `Employee.department`, `Employee.designation`, `Employee.team`, `Employee.reportingManager`, `Payslip.payrollStructure`) use composite FKs `fields: [companyId, <optionalId>]` with `onDelete: SetNull`, where `companyId` is non-nullable. `prisma validate` emits 7 referential-action warnings because Prisma cannot natively express PostgreSQL's column-specific `ON DELETE SET NULL ("<optionalId>")` used in hand-edited SQL migrations (`20261112050000_scope_optional_workforce_relationships`).
- Common failures: Running `prisma migrate dev` can generate broken SQL attempting `ON DELETE SET NULL` across both `companyId` and the optional column, failing at runtime on parent deletion or causing migration drift.
- Safe modification: Inspect every generated `migration.sql` before applying whenever touching `Department`, `Team`, `Employee`, `Designation`, or `PayrollStructure` relations, and preserve column-specific `ON DELETE SET NULL ("<column>")` clauses.
- Test coverage: Verified via PostgreSQL E2E tests in `e2e/16-tenant-relationships.spec.ts`, but fragile against future Prisma upgrades.

**Manual tenant and soft-delete scoping across all services:**
- Files: All services under `apps/backend/src/modules/**` and `apps/backend/src/common/services/data-scope.service.ts`.
- Why fragile: Because `tenant-extension.ts` is unused, every Prisma query must manually include `companyId` (and `deletedAt: null` on soft-deletable models like `Employee`, `Department`, `Team`, `User`, `PayrollStructure`). Notice subtle inconsistencies already exist—e.g., `apps/backend/src/modules/ai-assistant/ai-assistant.service.ts` lines 218 and 320 query `employee.findFirst({ where: { companyId, userId } })` without `deletedAt: null`, and `apps/backend/src/modules/analytics/analytics.service.ts` lines 126, 183, and 221 omit `deletedAt: null` on the caller lookup.
- Common failures: Platform roles (`SUPER_ADMIN`, `OPERATION_MANAGER`) with `companyId: null` accidentally triggering unscoped queries or 500 errors (historical D-06 and Super Admin payroll read bugs).
- Safe modification: Always resolve `companyId` through a strict helper rejecting null company context on tenant endpoints, use `DataScopeService.resolveEmployeeScope()`, and write negative cross-tenant and platform-role tests for every new endpoint.
- Test coverage: Strong unit and E2E coverage on recently audited modules (`resources`, `payroll`, `employees`), but relies on developer discipline for new modules.

**Regex-based AI Assistant intent routing and hardcoded policy text:**
- File: `apps/backend/src/modules/ai-assistant/ai-assistant.service.ts` (lines 13–46, 106–315, 364–400).
- Why fragile: Fast policy replies and privacy refusals rely on brittle substring/regex chains (`query.includes('home')`, `isThirdPartyCompensationQuery`, `isLeaveBalanceQuery`) evaluated in strict order before Gemini is called. Additionally, probation length (90 days), approval hierarchy, and fallback leave allocations (10/12/14) are hardcoded in prose strings rather than derived dynamically from tenant configuration.
- Common failures: Slight prompt rephrasing misroutes into the wrong fast-reply branch (already patched multiple times in commits `320ca82`, `fc0daa3`, `4a18a5f` — e.g., any prompt containing the word `"home"` triggers the WFH reply even if asking about `"home address"`!).
- Safe modification: Maintain and expand the regression suite in `apps/backend/src/modules/ai-assistant/ai-assistant.service.spec.ts` (currently 27 tests) before editing any regex condition or branch order.
- Test coverage: Good unit coverage (`ai-assistant.service.spec.ts`), but live Gemini responses are mocked in CI and unverified for recent commit `4a18a5f`.

**Bulk import BullMQ + 15-second cron reconciliation and large JSON payloads:**
- File: `apps/backend/src/modules/bulk-import/bulk-import-jobs.service.ts` (lines 77–225).
- Why fragile: Uploaded Excel workbooks (up to 10 MB) are base64-encoded (~13.3 MB) into Redis job data, then parsed rows are stored in `BulkImportJob.preparedRows` (`Json` column in Postgres), while a 15-second `@Cron` loop reconciles jobs older than 30 seconds. Note that `reconcile()` checks `createdAt < now - 30_000` and calls `recordTerminalFailure()` or re-queues jobs; under slow processing or Redis hiccups, worker and reconciler share fragile state transitions guarded only by `cursor` CAS updates.
- Common failures: Redis memory pressure or `commandTimeout: 5000` failures on large base64 workbooks; `reconcile()` running concurrently across multiple backend replicas.
- Safe modification: Stream/store temporary workbooks in object storage instead of Redis job payloads, enforce row-count caps in `prepareImport`, and ensure BullMQ lock duration exceeds worst-case single-row import time.
- Test coverage: Covered by `bulk-import-jobs.service.spec.ts`, `bulk-import.service.spec.ts`, and `e2e/17-bulk-import.spec.ts`.

## Scaling Limits

**Single-replica backend constraints (Socket.IO, in-memory Throttler, and in-process Crons):**
- Current capacity: 1 persistent Node.js backend instance (Railway / Render standard plan).
- Limit: Horizontal scaling to >=2 backend replicas breaks real-time WebSocket delivery and rate limiting immediately.
- Symptoms at limit:
  - `AttendanceGateway` (`apps/backend/src/modules/attendance/attendance.gateway.ts`) has no `@socket.io/redis-adapter`; clients connected to Replica A miss `break_alert` / `attendance_exception` events emitted on Replica B.
  - `ThrottlerModule` (`apps/backend/src/app.module.ts` lines 42–53) uses default in-memory storage; effective rate limits multiply by replica count and reset on restart.
  - Four `@Cron` jobs (`attendance.cron.ts`, `work-timer.service.ts`, `subscription-cron.service.ts`, `bulk-import-jobs.service.ts`) execute simultaneously on every replica (mitigated partially by DB CAS updates in `work-timer` and `subscription-cron`, but causing duplicate polling load on `attendance.cron.ts` and `bulk-import-jobs.service.ts`).
- Scaling path: Add `@socket.io/redis-adapter` backed by Redis, configure a Redis storage adapter for `@nestjs/throttler`, and move scheduled jobs to BullMQ repeatable jobs (or dedicated worker process).

**Unbounded database table growth:**
- Current capacity: Low initial row counts across early tenants.
- Limit: `audit_logs`, `notifications`, `stripe_webhook_receipts`, and `stripe_invoice_payments` (`apps/backend/prisma/schema.prisma`) grow indefinitely without TTL pruning or partitioning.
- Symptoms at limit: Slower notification inbox queries, bloated PostgreSQL storage/backups, and growing index maintenance overhead.
- Scaling path: Add scheduled retention/archival jobs (similar to the 24-hour cleanup on `bulk_import_jobs`), composite indexes on `notifications(userId, companyId, createdAt DESC)`, and table partitioning for `audit_logs` at enterprise volume.

**Vercel rewrite proxy overhead on long-polling and file transfers:**
- Current capacity: Suitable for small-to-medium concurrent user counts.
- Limit: `apps/frontend/next.config.ts` proxies all `/api/:path*` and `/api/attendance-events` traffic through Vercel to the backend origin; Vercel serverless/edge proxy request timeouts and bandwidth limits constrain long-lived polling connections and 10 MB uploads.
- Symptoms at limit: Frequent Socket.IO reconnect churn, 504 timeouts on slow payroll runs or bulk preview parses, and inflated Vercel bandwidth usage.
- Scaling path: Serve API/WebSockets from a custom first-party subdomain (e.g., `api.<domain>`) sharing the parent cookie domain so browsers talk directly to the backend with native WebSockets and `SameSite=Lax` cookies.

## Dependencies at Risk

**`xlsx` installed from external SheetJS CDN tarball:**
- Risk: `apps/backend/package.json` (line 62) specifies `"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"`. External tarball dependencies bypass standard npm registry mirrors, break offline/air-gapped builds if `cdn.sheetjs.com` is unreachable, and are not tracked by standard `npm audit` advisory databases.
- Impact: CI/CD installs (`npm ci`) or Docker builds fail if SheetJS CDN experiences downtime or URL changes; security advisories require manual monitoring.
- Migration plan: Migrate Excel read/write in `apps/backend/src/modules/bulk-import/bulk-import.service.ts` to an npm-registry-maintained library such as `exceljs`, or vendor/mirror the verified tarball in an internal artifact registry.

**`stripe` SDK (`^23.0.1`) pinned to legacy API version via `as any`:**
- Risk: `apps/backend/src/modules/subscriptions/subscriptions.service.ts` (lines 9, 36) imports Stripe via CommonJS `require('stripe')` and forces `{ apiVersion: '2024-06-20' as any }` on SDK v23.x.
- Impact: Type definitions in `stripe@23` reflect a much newer Stripe API schema (visible in the dual invoice property fallback at line 317: `invoice.parent?.subscription_details?.subscription ?? invoice.subscription`), increasing risk of runtime payload shape mismatches on webhook events.
- Migration plan: Switch to ES module import (`import Stripe from 'stripe'`), align Stripe Dashboard and SDK `apiVersion`, and validate webhook event payloads against pinned Stripe CLI fixtures.

**`geoip-lite` (`2.0.3`) static geolocation database:**
- Risk: `apps/backend/package.json` (line 50) uses `geoip-lite`, which bundles a static IP-to-location dataset at install time and requires periodic data updates (`updatedb`) to avoid stale IP mappings; it also adds significant memory footprint on startup.
- Impact: Login city/country telemetry (`apps/backend/src/common/utils/login-network-location.ts`) drifts over time and increases Node heap baseline.
- Migration plan: Either schedule `geoip-lite` database refreshes during image builds or read edge geolocation headers (e.g., Vercel `x-vercel-ip-city`/`x-vercel-ip-country`) signed alongside client IP forwarding.

**Root `package.json` security overrides and unused Bull packages:**
- Risk: Root `package.json` (lines 33–43) maintains 9 transitive dependency overrides (`multer`, `body-parser`, `express/qs`, `@nestjs/common/file-type`, `uuid`, `js-yaml`, `lodash`, `next/postcss`), and `apps/backend/package.json` retains unused `bull` + `@nestjs/bull`. Additionally, `apps/frontend/package.json` uses `zod@4.6.7` + `@hookform/resolvers@5.2.2` with `next@15.5.29` / `react@18.3.1`.
- Impact: Dependency upgrades can silently conflict with pinned overrides or break Zod v4 schema inference; unused Bull packages trigger recurring CVE churn.
- Migration plan: Remove `bull` and `@nestjs/bull`, audit overrides on every NestJS/Next.js minor upgrade, and run `npm audit` in `.github/workflows/ci.yml`.

## Missing Critical Features

**Post-trial expiration workflow and enforcement:**
- Problem: Tenants receive a 14-day `TRIALING` subscription on creation, but no automated workflow notifies admins before trial end or transitions expired trials.
- Current workaround: Manual tracking and suspension by Super Admin.
- Blocks: Self-serve SaaS conversion and revenue enforcement.
- Implementation complexity: Medium (product policy decision + daily cron in `subscription-cron.service.ts` + guard check in `subscription-tier.guard.ts` + billing banner UI).

**Frontend React Error Boundaries and custom 404 handling:**
- Problem: `apps/frontend/src/app/` has no `error.tsx`, `global-error.tsx`, or `not-found.tsx` files (and no `/dashboard/error.tsx`).
- Current workaround: Unhandled runtime exceptions fall through to Next.js's generic error fallback with no telemetry or user-friendly recovery action.
- Blocks: Graceful fault isolation when an individual dashboard module fails to render.
- Implementation complexity: Low (add `apps/frontend/src/app/error.tsx`, `apps/frontend/src/app/global-error.tsx`, `apps/frontend/src/app/dashboard/error.tsx`, and `apps/frontend/src/app/not-found.tsx`).

**First-login password setup / rotation workflow for bulk-imported and onboarded employees:**
- Problem: Bulk-imported users are created with `passwordHash: PASSWORD_SETUP_REQUIRED` (`apps/backend/src/modules/bulk-import/bulk-import.service.ts` line 239) without automatically sending a password-setup invite email, forcing them to manually use "Forgot Password". Individually onboarded employees receive a plaintext 24-bit temp password with no forced change on first sign-in.
- Current workaround: HR shares the temp password from the onboarding response or instructs imported staff to use `/forgot-password`.
- Blocks: Secure zero-touch enterprise onboarding.
- Implementation complexity: Medium (add `mustChangePassword` flag or hashed invite-token dispatch queued via BullMQ).

**Production observability and health endpoint:**
- Problem: No dedicated `/api/v1/health` endpoint exists (CI checks `/api/docs`), and there is no structured JSON logging, APM, or error-tracking integration (e.g., Sentry/OpenTelemetry). `GlobalExceptionFilter` logs only to stdout via NestJS `Logger`.
- Current workaround: Manual log inspection on Railway/Vercel dashboards.
- Blocks: Proactive alerting on failed crons, Stripe webhook errors, and database latency spikes.
- Implementation complexity: Low–Medium (add `@nestjs/terminus` health check + error-reporting SDK).

## Test Coverage Gaps

**Zero frontend unit or component tests:**
- What's not tested: All React components, hooks, form schemas, `apps/frontend/src/lib/api.ts` token-refresh race handling, `apps/frontend/src/lib/auth-context.tsx`, `apps/frontend/src/lib/attendance-duration.ts`, and `apps/frontend/src/middleware.ts` HMAC IP signing lack unit tests (no Vitest/Jest setup in `apps/frontend/package.json`).
- Risk: UI regressions, edge-case formatting bugs, and client auth-refresh loops are only caught by slow full-stack Playwright runs.
- Priority: Medium.
- Difficulty to test: Low–Medium (add Vitest + React Testing Library for pure utilities, `api.ts`, `middleware.ts`, and complex forms).

**29 backend source files without unit test specs:**
- What's not tested: Notable untested backend files include `apps/backend/src/modules/auth/auth.controller.ts`, `apps/backend/src/modules/companies/companies.service.ts`, `apps/backend/src/modules/companies/companies.controller.ts`, `apps/backend/src/modules/subscriptions/subscriptions.controller.ts`, `apps/backend/src/modules/bulk-import/bulk-import.controller.ts`, `apps/backend/src/modules/ai-assistant/ai-assistant.controller.ts`, `apps/backend/src/common/filters/global-exception.filter.ts`, `apps/backend/src/common/request-context/request-context.middleware.ts`, `apps/backend/src/common/services/audit-log.service.ts`, `apps/backend/src/modules/payroll/payroll-configuration.ts`, `apps/backend/src/modules/organization/designations/*`, and all 3 operational scripts under `apps/backend/src/scripts/`.
- Risk: Controller-level decorator regressions (missing `@Roles`, `@Throttle`, `@UseGuards`, cookie flags, raw-body forwarding) and `CompaniesService` validation bugs can slip past service-only unit tests.
- Priority: High (for `auth.controller.ts`, `companies.service.ts`, `subscriptions.controller.ts`, `payroll-configuration.ts`, and `global-exception.filter.ts`).
- Difficulty to test: Low (NestJS testing module with mocked services).

**End-to-end third-party integration verification (Stripe, Cloudinary, Gemini, Resend/SMTP):**
- What's not tested: CI runs with mock storage, mock billing/Stripe, and fallback AI policy engine; real Stripe Checkout -> webhook -> Customer Portal cancellation, real Cloudinary authenticated PDF signed downloads (D-07), live Resend/SMTP delivery, and live Gemini fallback responses are not exercised in automated tests.
- Risk: Third-party API schema changes (e.g., Stripe SDK v23 vs. `2024-06-20`, Cloudinary delivery types, Gemini model deprecation of `gemini-3.5-flash`) can break production silently while CI stays green.
- Priority: High.
- Difficulty to test: Medium (requires staging/sandbox credentials in a dedicated nightly or pre-release workflow).

**Uncommitted payroll structure migration and E2E persistence:**
- What's not tested: `e2e/payroll-structure.spec.ts` and `apps/backend/prisma/migrations/20261117000000_assign_payroll_structures/migration.sql` have not been executed against a real migrated PostgreSQL database in CI (per `UAT_DEFECT_AUDIT.md`, local UI test used mocked API responses).
- Risk: Migration constraints (`ON DELETE RESTRICT` on `employees.payrollStructureId`) or multi-currency payroll validation edge cases could fail against real Postgres state.
- Priority: High (blocks deploying the local payroll changes).
- Difficulty to test: Low once committed and run through `.github/workflows/ci.yml`.

---

*Concerns audit: 2026-11-19*
*Update as issues are fixed or new ones discovered*
