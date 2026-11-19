# Architecture

**Analysis Date:** 2026-11-19

## Pattern Overview

**Overall:** Multi-Tenant SaaS Monorepo — Modular Monolith Backend (NestJS) + Role-Adaptive SPA/App Router Frontend (Next.js) with Shared PostgreSQL, Redis/BullMQ, and Socket.IO

**Key Characteristics:**
- **npm Workspaces Monorepo:** Single repository housing `@zenhr/backend` (`apps/backend`) and `@zenhr/frontend` (`apps/frontend`) plus root Playwright browser/PostgreSQL E2E tests (`e2e/`).
- **Same-Origin Reverse Proxy Boundary:** Next.js rewrites `/api/:path*` and `/api/attendance-events` to the NestJS API and Socket.IO endpoint (`apps/frontend/next.config.ts`), enabling `httpOnly` cookie authentication without cross-site cookie friction and forwarding HMAC-signed client IP headers via Next.js middleware (`apps/frontend/src/middleware.ts`).
- **Two-Layer Multi-Tenant Authorization:** Every protected backend endpoint enforces (1) role/tier guards (`JwtAuthGuard`, `RolesGuard`, `SubscriptionTierGuard`) at the controller boundary and (2) explicit tenant + hierarchical data-scope filtering (`companyId`, `DataScopeService`, and PostgreSQL composite tenant foreign keys) inside service queries.
- **Audited Super Admin Support Mode:** Platform administrators impersonate a tenant by receiving a time-limited, database-tracked `SupportModeSession` JWT carrying `supportModeCompanyId`, validated on every HTTP request and WebSocket emission while preserving their own notification inbox.
- **Hybrid Real-Time & Async Execution:** Long-running persistent NestJS server process runs in-process `@nestjs/schedule` cron jobs, a BullMQ Redis worker for durable row-by-row Excel employee imports, and a `/ws/attendance` Socket.IO gateway for break-overstay and attendance-exception alerts.
- **Graceful Degradation for External Integrations:** Stripe, Cloudinary, Resend/SMTP, and Google Gemini each degrade cleanly in non-production or unconfigured environments (local billing simulation, deterministic mock storage URLs, bounded-timeout email no-op, and deterministic local HR policy engine fallback).

## Layers

**Frontend Presentation & Routing Layer (Next.js App Router):**
- Purpose: Renders public authentication/recovery flows and the role-adaptive dashboard shell with client-side route guards, TanStack Query caching, Recharts visualizations, and Tailwind/dark-mode UI.
- Contains: App Router pages (`apps/frontend/src/app/**`), layout chrome (`apps/frontend/src/components/layout/**`), auth/UI components (`apps/frontend/src/components/auth/**`, `apps/frontend/src/components/ui/**`), and client helpers (`apps/frontend/src/lib/**`).
- Depends on: Next.js proxy rewrites (`/api/v1/*`, `/api/attendance-events`), `AuthProvider`, `QueryProvider`, and `api` fetch wrapper.
- Used by: End-user browsers across 7 roles (`SUPER_ADMIN`, `OPERATION_MANAGER`, `COMPANY_ADMIN`, `HR_MANAGER`, `DEPARTMENT_MANAGER`, `TEAM_LEAD`, `EMPLOYEE`).

**Frontend Edge Proxy & IP Attestation Layer:**
- Purpose: Proxies browser HTTP and Socket.IO traffic to the backend origin, enforces browser security headers (CSP, `X-Frame-Options`, `Permissions-Policy`), and signs verified client IPs.
- Contains: `apps/frontend/next.config.ts` (rewrites and security headers) and `apps/frontend/src/middleware.ts` (strips untrusted forwarded IP headers and computes HMAC-SHA256 `x-zenhr-client-ip-*` headers using `IP_FORWARDING_SECRET`).
- Depends on: `NEXT_PUBLIC_API_URL`, `IP_FORWARDING_SECRET`.
- Used by: Every `/api/*` request from the browser.

**Backend HTTP & WebSocket Edge Layer (NestJS):**
- Purpose: Handles request parsing, security headers (`helmet`), CORS, cookie parsing, trusted proxy resolution, request-scoped `AsyncLocalStorage` context population, rate limiting, DTO validation, response enveloping, and global exception normalization.
- Contains: `apps/backend/src/main.ts`, `apps/backend/src/common/request-context/*`, `apps/backend/src/common/guards/*`, `apps/backend/src/common/decorators/*`, `apps/backend/src/common/interceptors/response.interceptor.ts`, `apps/backend/src/common/filters/global-exception.filter.ts`, and `apps/backend/src/modules/attendance/attendance.gateway.ts`.
- Depends on: Passport JWT (`JwtStrategy`), `@nestjs/throttler`, `class-validator`, `ConfigService`.
- Used by: Frontend proxy, Stripe webhooks (`/api/v1/subscriptions/webhook`), and Swagger UI (`/api/docs`).

**Backend Feature Controller Layer:**
- Purpose: Declares REST endpoints under `/api/v1/<resource>`, binds `@UseGuards`, `@Roles`, `@RequireSubscriptionTier`, `@Public`, `@Throttle`, `@CurrentUser`, and multipart file interceptors, and delegates all domain logic to services.
- Contains: 17 feature controllers under `apps/backend/src/modules/**/*.controller.ts` (including nested `organization/{departments,designations,teams}`).
- Depends on: Feature services, DTO classes (`**/dto/*.dto.ts`), common guards and decorators.
- Used by: NestJS router after middleware and global guards.

**Backend Domain Service & Workflow Layer:**
- Purpose: Encapsulates multi-tenant business logic, role-scoped queries, approval workflows, payroll calculations and PDF generation, Stripe billing reconciliation, AI policy routing, and transactional state transitions.
- Contains: Feature services under `apps/backend/src/modules/**/*.service.ts`, specialized engines (`apps/backend/src/modules/leave/approval-engine.service.ts`, `apps/backend/src/modules/payroll/pdf.service.ts`, `apps/backend/src/modules/payroll/payroll-configuration.ts`), and shared services (`apps/backend/src/common/services/data-scope.service.ts`, `apps/backend/src/common/services/audit-log.service.ts`, `apps/backend/src/common/mail/mail.service.ts`, `apps/backend/src/common/storage/storage.service.ts`).
- Depends on: `PrismaService`, `DataScopeService`, external SDKs (`stripe`, `@google/genai`, `cloudinary`, `nodemailer`, `pdfkit`, `xlsx`, `otplib`), and `AttendanceGateway`.
- Used by: Feature controllers, scheduled cron jobs, and BullMQ workers.

**Backend Asynchronous Jobs & Scheduled Cron Layer:**
- Purpose: Executes durable background processing and time-based lifecycle enforcement outside HTTP request latency.
- Contains:
  - BullMQ queue & worker + 15-second reconciliation cron in `apps/backend/src/modules/bulk-import/bulk-import-jobs.service.ts` (queue `zenhr-employee-imports`).
  - Hourly timezone-aware shift absence & approved-leave marker in `apps/backend/src/modules/attendance/attendance.cron.ts`.
  - 15-second paused work-timer overstay monitor in `apps/backend/src/modules/work-timer/work-timer.service.ts`.
  - Daily 2:00 AM payment retry notice & 60-day non-payment suspension job in `apps/backend/src/modules/subscriptions/subscription-cron.service.ts`.
- Depends on: `PrismaService`, Redis (`REDIS_URL` / `REDIS_HOST`), `MailService`, `AttendanceGateway`.
- Used by: NestJS `ScheduleModule` and `OnModuleInit` worker lifecycle.

**Persistence & Data Integrity Layer (PostgreSQL + Prisma):**
- Purpose: Stores all platform and tenant relational data across 32 Prisma models and 17 enums with composite tenant indexes, soft-delete columns (`deletedAt`), and transactional locks.
- Contains: `apps/backend/prisma/schema.prisma`, `apps/backend/prisma/migrations/*`, `apps/backend/prisma/seed.ts`, `apps/backend/src/common/prisma/prisma.service.ts`, `apps/backend/src/common/prisma/employee-onboarding-lock.ts`, `apps/backend/src/common/prisma/initialize-employee-policies.ts`, and `apps/backend/src/common/prisma/tenant-extension.ts`.
- Depends on: PostgreSQL 16 (`DATABASE_URL`).
- Used by: All backend services and operational CLI scripts (`apps/backend/src/scripts/*`).

## Data Flow

**Authenticated HTTP Request & Token Refresh Lifecycle:**

1. Browser component triggers a TanStack Query or mutation through `api.get/post/patch/delete` (`apps/frontend/src/lib/api.ts`), sending `credentials: 'include'` to `/api/v1/...`.
2. Next.js middleware (`apps/frontend/src/middleware.ts`) strips spoofed `x-zenhr-client-ip*` headers and attaches HMAC-signed client IP headers if `IP_FORWARDING_SECRET` is set; `next.config.ts` rewrites the request to the NestJS backend.
3. NestJS `RequestContextMiddleware` (`apps/backend/src/common/request-context/request-context.middleware.ts`) decodes `access_token` cookie (if present) and binds `{ userId, companyId, role, supportModeCompanyId, ipAddress, userAgent }` into `AsyncLocalStorage` (`requestContextStorage`).
4. Global `RequestThrottlerGuard` (`apps/backend/src/common/guards/request-throttler.guard.ts`) throttles authenticated calls per `user:<id>` and public calls by IP, skipping unauthenticated session probes marked with `@SessionProbe`.
5. Controller guards execute in order: `JwtAuthGuard` (validates `access_token` via `JwtStrategy` against live DB user status, `sessionVersion`, company status, employee status, and active `SupportModeSession`), `RolesGuard` (checks `@Roles()` and treats `SUPER_ADMIN` in Support Mode as satisfying `COMPANY_ADMIN`), and `SubscriptionTierGuard` (when applied, checks `Subscription.tier` and rejects `SUSPENDED` tenants).
6. Global `ValidationPipe` strips unknown properties (`whitelist: true`, `forbidNonWhitelisted: true`) and transforms DTOs.
7. Service resolves effective tenant (`user.supportModeCompanyId || user.companyId`), computes hierarchical scope via `DataScopeService.resolveEmployeeScope()` / `applyScope()`, and runs Prisma queries/transactions.
8. `ResponseInterceptor` wraps JSON responses into `{ success: true, data, message, timestamp }` (passing `StreamableFile` binary streams like payslip PDFs through untouched); `apiRequest` unwraps `.data`.
9. If the backend returns `401` on a non-public route, `apps/frontend/src/lib/api.ts` deduplicates a single `POST /api/v1/auth/refresh` call (`refreshInFlight` + `sessionVersion` counter) and retries the original request once.

**Role-Adaptive Dashboard & Module Manifest Flow:**

1. `AuthProvider` (`apps/frontend/src/lib/auth-context.tsx`) queries `GET /api/v1/auth/me` and, once authenticated, `GET /api/v1/auth/me/modules`.
2. Backend derives `allowedModules` exclusively from `ROLE_MODULE_MAP` (`apps/backend/src/common/services/data-scope.service.ts`) (and swaps to tenant-scoped views when `SUPER_ADMIN` is in Support Mode).
3. `Sidebar` (`apps/frontend/src/components/layout/sidebar.tsx`) filters `ALL_NAV_ITEMS` strictly against `allowedModules`; `DashboardLayout` (`apps/frontend/src/app/dashboard/layout.tsx`) enforces both `moduleRoutePrefixes` and `tenantRouteRoles`, rendering an inline "Access Denied" state if a user navigates directly to a disallowed URL.
4. `apps/frontend/src/app/dashboard/page.tsx` fetches `GET /api/v1/analytics/overview` and switches its dashboard layout by `user.role` and `supportModeCompanyId`.

**Attendance Check-In, Work Timer & Real-Time Alert Flow:**

1. Employee submits check-in (`POST /api/v1/attendance/check-in`) or starts/pauses the Premium Work Timer (`apps/backend/src/modules/work-timer/work-timer.service.ts`).
2. `AttendanceService.checkIn()` validates verified client IP against tenant `IpWhitelist` and checks active `RemoteWorkPermission`. Unauthorized off-network punches record `ABSENT_PENDING_REVIEW`, persist `Notification` rows, send email via `MailService`, and emit `attendance_exception` to the `hr_<companyId>` Socket.IO room (`AttendanceGateway`).
3. When a paused work timer exceeds shift break allowance (checked on resume/stop and every 15 seconds via `@Cron('*/15 * * * * *')`), `WorkTimerService.recordBreakAlert()` atomically claims `breakAlertedAt`, inserts `BREAK_ALERT` notifications for active `COMPANY_ADMIN`, `HR_MANAGER`, assigned `TEAM_LEAD`, and `DEPARTMENT_MANAGER`, sends emails, and emits `break_alert` via `AttendanceGateway`.
4. `AttendanceGateway.emitToCurrentSessions()` re-validates every connected socket's JWT session via `JwtStrategy.validate()` before emitting.
5. `Header` (`apps/frontend/src/components/layout/header.tsx`) connects `socket.io-client` to namespace `/ws/attendance` via proxy path `/api/attendance-events` (`transports: ['polling']`) for manager/admin roles and invalidates the TanStack Query `['notifications']` cache upon `break_alert` or `attendance_ready`.

**Leave & Resource Multi-Step Approval Flow:**

1. Leave submission (`apps/backend/src/modules/leave/leave.service.ts`) enforces probation eligibility (`ApprovalEngineService.assertCanRequestLeave()` blocks `EMPLOYEE` accounts in `ON_PROBATION` for 90 days from `hireDate`), active `LeaveTypeSetting` rules (reason & medical certificate upload to `StorageService`), and per-calendar-year balance splitting (`splitLeaveBalanceDays`).
2. `ApprovalEngineService.resolveApprovers()` computes Step 1 and Step 2 approvers dynamically from role and reporting chain (`EMPLOYEE`: Team Lead/Manager -> HR; `TEAM_LEAD`: Dept Manager -> HR; `DEPARTMENT_MANAGER`/`HR_MANAGER`: Company Admin -> Skipped; `COMPANY_ADMIN`/platform: auto-skipped) and skips duplicate/self steps.
3. Step decisions use atomic conditional updates with `rethrowMissingRecordAsConflict` (`apps/backend/src/common/utils/prisma-conflict.ts`) to prevent concurrent double-approvals, reconcile `LeaveBalance` pending/used days, and reflect approved leave onto `AttendanceRecord`.
4. Resource requests (`apps/backend/src/modules/resources/resources.service.ts`) follow a parallel 2-step + fulfillment lifecycle (`PENDING` -> `STEP_1_APPROVED` -> `STEP_2_APPROVED` -> `FULFILLED`) routed from requester -> Department Manager -> HR/Company Admin -> Operations/Fulfillment.

**Payroll Execution & Payslip PDF Flow:**

1. HR/Company Admin configures `PayrollStructure` records (base salary, recurring earnings/deductions, tax brackets validated by `apps/backend/src/modules/payroll/payroll-configuration.ts`) under a PostgreSQL transaction advisory lock (`pg_advisory_xact_lock` keyed by `zenhr-payroll:<companyId>`).
2. Monthly payroll run executes within a `ReadCommitted` transaction (60s timeout) guarded by the same advisory lock to avoid duplicate runs, creating `Payslip` records and `PAYSLIP_GENERATED` notifications.
3. Payslip downloads stream on-demand PDFs generated in memory by `PdfService` (`apps/backend/src/modules/payroll/pdf.service.ts`, using `pdfkit`) as NestJS `StreamableFile` responses bypassed by `ResponseInterceptor`.

**Durable Bulk Employee Import Flow:**

1. HR/Company Admin uploads an `.xlsx` workbook to `POST /api/v1/employees/bulk/import`.
2. `BulkImportJobsService.submit()` creates a `BulkImportJob` row (`QUEUED`) and enqueues a base64 payload into BullMQ queue `zenhr-employee-imports` (4 attempts, exponential backoff).
3. In-process BullMQ worker re-verifies submitter/support-mode authorization, parses and validates rows via `BulkImportService.prepareImport()`, transitions the job to `PROCESSING`, clears the workbook payload from Redis, and imports rows one-by-one inside per-row `ReadCommitted` transactions using optimistic cursor claiming (`where: { id, status: PROCESSING, cursor }`).
4. A 15-second reconciliation cron (`BulkImportJobsService.reconcile()`) recovers orphaned `PROCESSING` jobs and prunes completed jobs older than 24 hours; frontend polls job status via `GET /api/v1/employees/bulk/jobs/:id`.

**Subscription Billing & Stripe Recovery Flow:**

1. `SubscriptionsController` exposes authenticated Checkout/Portal endpoints plus `@Public()` `POST /api/v1/subscriptions/webhook` using NestJS `rawBody: true` for Stripe signature verification.
2. `SubscriptionsService` deduplicates webhook events via `StripeWebhookReceipt` and tracks invoice state via `StripeInvoicePayment` and `latestInvoiceId` to ignore stale out-of-order failures.
3. On payment failure, subscription moves to `PAST_DUE` and sets `unpaidSince`; `SubscriptionCronService` (daily at 2:00 AM) sends idempotent retry notices (`lastNotifiedRetry` claim) for attempts 1-3 and suspends both `Subscription` and `Company` (`NON_PAYMENT`) after 60 days unpaid, writing an immutable `AuditLog` entry.

**AI HR Policy Assistant Flow:**

1. Premium-gated endpoint `POST /api/v1/ai/chat` (`@RequireSubscriptionTier(SubscriptionTier.PREMIUM)`) invokes `AiAssistantService.processQuery()` (`apps/backend/src/modules/ai-assistant/ai-assistant.service.ts`).
2. Deterministic fast-path rules (`getFastPolicyReply()`) immediately answer common HR policy, leave-balance, probation, break-timer, WFH, and compensation-privacy queries directly from tenant PostgreSQL records (refusing third-party salary queries without hitting external APIs).
3. Open-ended questions load tenant company, employee, leave policies, and balances into a grounded system prompt and call Google Gemini (`@google/genai`, default `gemini-3.5-flash` with configurable `GEMINI_MODEL` fallback and 15s `AbortSignal` deadline), falling back to a deterministic policy message on timeout or unconfigured `GEMINI_API_KEY`.

**State Management:**
- **Backend:** Stateless across HTTP requests; authoritative state lives in PostgreSQL (`PrismaService`) and BullMQ job metadata in Redis. Per-request identity metadata is propagated via Node `AsyncLocalStorage` (`requestContextStorage`).
- **Frontend:** Server state managed by TanStack Query (`apps/frontend/src/lib/query-provider.tsx`, 60s `staleTime`, `retry: 1`, `refetchOnWindowFocus: false`). Auth state exposed via React Context (`AuthProvider`) backed by `['auth', 'me']` and `['auth', 'modules']` queries. UI theme preference stored in `localStorage` (`theme`).

## Key Abstractions

**DataScopeService & Role Manifests:**
- Purpose: Single source of truth mapping the 7 `UserRole` values to `DataScope` (`PLATFORM`, `COMPANY`, `DEPARTMENT`, `TEAM`, `SELF`) and frontend navigation modules (`ROLE_MODULE_MAP`), and generating Prisma `where` clauses for employee-scoped queries.
- Examples: `apps/backend/src/common/services/data-scope.service.ts`, used across `EmployeesService`, `AttendanceService`, `LeaveService`, `ResourcesService`, `AnalyticsService`, and `AuthService`.
- Pattern: Strategy/Policy Service injected via `@Global()`/`DataScopeModule`.

**RequestContext & Tenant Isolation Mechanism:**
- Purpose: Captures authenticated identity, effective tenant (`supportModeCompanyId || companyId`), client IP, and user agent per HTTP request via `AsyncLocalStorage`.
- Examples: `apps/backend/src/common/request-context/request-context.storage.ts`, `apps/backend/src/common/request-context/request-context.middleware.ts`, `apps/backend/src/common/request-context/request-context.service.ts`.
- Pattern: Middleware + AsyncLocalStorage context holder. Note: `apps/backend/src/common/prisma/tenant-extension.ts` provides a Prisma `$extends` prototype (`createTenantPrismaClient`) with unit tests (`tenant-extension.spec.ts`), whereas production runtime injects `PrismaService` directly (`apps/backend/src/common/prisma/prisma.module.ts`) and enforces tenant boundaries explicitly in service `where` clauses + database composite foreign keys.

**Two-Layer Guard Chain:**
- Purpose: Declarative route security combining authentication, RBAC, Support Mode delegation, rate limiting, and subscription tier enforcement.
- Examples: `apps/backend/src/common/guards/request-throttler.guard.ts` (global `APP_GUARD`), `apps/backend/src/common/guards/jwt-auth.guard.ts`, `apps/backend/src/common/guards/roles.guard.ts`, `apps/backend/src/common/guards/subscription-tier.guard.ts`.
- Pattern: NestJS Guard pipeline with metadata decorators (`@Public`, `@Roles`, `@RequireSubscriptionTier`, `@SessionProbe`).

**ApprovalEngineService:**
- Purpose: Pure domain engine computing probation leave eligibility, role-based 2-step approver chains, self/duplicate-step skipping, approval authorization checks, and inclusive calendar day counts.
- Examples: `apps/backend/src/modules/leave/approval-engine.service.ts`.
- Pattern: Stateless Domain Service.

**AuditLogService:**
- Purpose: Appends immutable security and compliance records (`AuditAction` enum) including Support Mode session IDs, IP addresses, and before/after JSON snapshots.
- Examples: `apps/backend/src/common/services/audit-log.service.ts` and direct transactional `tx.auditLog.create` calls in `SuperAdminService` and `SubscriptionCronService`.
- Pattern: Append-Only Audit Logger.

**Frontend API Client & Auth Context:**
- Purpose: Centralizes same-origin `/api/v1` requests, `httpOnly` cookie credentials, FormData handling, automatic single-flight 401 refresh retry, response unwrapping, and typed `ApiError` throwing.
- Examples: `apps/frontend/src/lib/api.ts`, `apps/frontend/src/lib/auth-context.tsx`.
- Pattern: Fetch Wrapper + React Context Provider over TanStack Query.

## Entry Points

**Backend HTTP & WebSocket Server:**
- Location: `apps/backend/src/main.ts`
- Triggers: `npm run start:dev --workspace=apps/backend` (dev) or `node apps/backend/dist/src/main.js` / `npm run start:prod --workspace=apps/backend` (prod).
- Responsibilities: Bootstraps NestJS Express application with `rawBody: true`, validates proxy/IP forwarding config, applies Helmet CSP, `cookie-parser`, CORS, global `/api/v1` prefix, `ValidationPipe`, `ResponseInterceptor`, `GlobalExceptionFilter`, Swagger at `/api/docs`, and graceful shutdown hooks.

**Backend Root Module:**
- Location: `apps/backend/src/app.module.ts`
- Triggers: Loaded by `NestFactory.create(AppModule)`.
- Responsibilities: Registers `ConfigModule`, `ThrottlerModule`, `ScheduleModule`, core modules (`RequestContextModule`, `PrismaModule`, `MailModule`), all 17 domain modules, and global `RequestThrottlerGuard`.

**Backend Operational CLI Scripts:**
- Location: `apps/backend/src/scripts/bootstrap-admin.ts`, `apps/backend/src/scripts/encrypt-totp.ts`, `apps/backend/src/scripts/revoke-legacy-import-sessions.ts`, and `apps/backend/prisma/seed.ts`.
- Triggers: Manual `npm run auth:*` or `npm run prisma:seed` invocations during deployment/maintenance.
- Responsibilities: Provision initial `SUPER_ADMIN` (`Serializable` transaction), backfill AES-GCM encryption on legacy TOTP secrets, revoke retired bulk-import credentials, and seed local/CI test tenants.

**Frontend Next.js App Entry & Middleware:**
- Location: `apps/frontend/src/app/layout.tsx`, `apps/frontend/src/app/page.tsx`, `apps/frontend/src/middleware.ts`, `apps/frontend/next.config.ts`.
- Triggers: Next.js dev/production HTTP server (`npm run dev --workspace=apps/frontend` or `next start`).
- Responsibilities: Root layout wraps all routes in `QueryProvider` and `AuthProvider`; root `/` redirects to `/dashboard` or `/login`; middleware signs client IPs for `/api/:path*`; `apps/frontend/src/app/dashboard/layout.tsx` guards all authenticated dashboard pages.

## Error Handling

**Strategy:** Backend throws NestJS `HttpException` subclasses or Prisma errors which bubble to `GlobalExceptionFilter` (`apps/backend/src/common/filters/global-exception.filter.ts`) for uniform JSON error formatting; frontend `apiRequest` (`apps/frontend/src/lib/api.ts`) normalizes HTTP failures into `ApiError` instances consumed by page/component states and TanStack Query.

**Patterns:**
- **Uniform Backend Error Envelope:** `GlobalExceptionFilter` returns `{ success: false, data: null, message, errors, timestamp, path }`, maps `class-validator` error arrays to `message: 'Validation failed'` + `errors`, and maps Prisma `PrismaClientKnownRequestError` codes (`P2002` -> 409 Conflict, `P2025` -> 404 Not Found, `P2003` -> 400 Bad Request).
- **Optimistic Concurrency Protection:** Multi-step approval and state-change paths use `rethrowMissingRecordAsConflict` (`apps/backend/src/common/utils/prisma-conflict.ts`) and conditional `updateMany` counts to turn concurrent modifications into `409 ConflictException`.
- **Server Error Logging:** `GlobalExceptionFilter` logs stack traces only for `status >= 500` to avoid noisy 4xx logs.
- **Frontend Session vs. Outage Distinction:** `AuthProvider` and `DashboardLayout` distinguish `401 Unauthorized` (redirects to `/login`) from 5xx/network failures (`sessionUnavailable` state with explicit "Try again" recovery button rather than erroneously logging the user out).
- **Public Auth Proxy Fault Handling:** `apps/frontend/src/lib/api.ts` detects non-JSON error responses on public auth routes (e.g., upstream backend unavailable) and throws a user-friendly availability message.

## Cross-Cutting Concerns

**Logging:**
- NestJS built-in `Logger` instantiated per service/gateway/filter (`new Logger(ClassName.name)`). Prisma logs queries via events and errors/warnings to stdout (`apps/backend/src/common/prisma/prisma.service.ts`).

**Validation:**
- Backend: Global `ValidationPipe` (`whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`, implicit conversion) paired with `class-validator` / `class-transformer` DTOs in `**/dto/*.dto.ts`, plus domain validators (`password-policy.ts`, `payroll-configuration.ts`, `employee-dates.ts`, `StorageService` MIME/size checks).
- Frontend: React Hook Form + Zod (`@hookform/resolvers`, `zod`) and inline form validation (e.g., UTF-8 72-byte bcrypt length check in `apps/frontend/src/components/auth/recovery-form.tsx`).

**Authentication & Session Security:**
- Short-lived `access_token` (15m default) and `refresh_token` (7d default) JWTs delivered in `httpOnly` cookies (`COOKIE_SECRET`, separate `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` enforced to be >=32 bytes and distinct in production by `apps/backend/src/common/config/app.config.ts`).
- `JwtStrategy` validates live DB account state and monotonic `sessionVersion` on every authenticated request, enabling immediate session revocation on password reset, status termination, or Support Mode exit.
- Optional TOTP 2FA (`otplib`, `qrcode`) with secrets encrypted at rest using `TOTP_ENCRYPTION_KEY` (`apps/backend/src/modules/auth/totp-secret.ts`); temporary 2FA tokens (`is2faTemp: true`) are explicitly rejected by `JwtStrategy`.
- Account lockout after 5 failed login attempts for 15 minutes; password reset tokens stripped from browser URL history on mount (`RecoveryForm`).

**Outbound Communications & Storage:**
- Email (`apps/backend/src/common/mail/mail.service.ts`): Supports HTTPS Resend API (`RESEND_API_KEY`) or SMTP via Nodemailer (`MAIL_HOST`/`MAIL_USER`/`MAIL_PASSWORD`), bounded by a hard 8-second `AbortController` deadline so slow mail servers never block onboarding or notifications.
- Object Storage (`apps/backend/src/common/storage/storage.service.ts`): Uploads validated images/PDFs/Office docs to Cloudinary (`CLOUDINARY_*`) with support for authenticated delivery; strictly stores URLs/public IDs in PostgreSQL.

---

*Architecture analysis: 2026-11-19*
*Update when major patterns change*
