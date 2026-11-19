# Codebase Structure

**Analysis Date:** 2026-11-19

## Directory Layout

```
HRMS/
├── .github/
│   └── workflows/           # GitHub Actions CI/CD pipeline (ci.yml)
├── .planning/               # GSD project planning, phase history, quick fixes, and codebase maps
│   ├── codebase/            # Mapped codebase intelligence (ARCHITECTURE.md, STRUCTURE.md, etc.)
│   ├── debug/               # Browser release verification notes
│   ├── phases/              # 7 milestone phase directories
│   ├── quick/               # Ad-hoc quick-task records
│   └── research/            # Initial project research docs
├── apps/
│   ├── backend/             # @zenhr/backend — NestJS 10 REST API, WebSocket gateway, BullMQ worker, Prisma
│   │   ├── prisma/          # Schema, migrations, and seed script
│   │   └── src/             # Application source (common/, modules/, scripts/, main.ts, app.module.ts)
│   └── frontend/            # @zenhr/frontend — Next.js 15 App Router web application
│       ├── public/          # Static assets (auth hero image)
│       └── src/             # App Router pages, components, lib helpers, and IP-signing middleware
├── e2e/                     # Playwright end-to-end browser & PostgreSQL regression specs + helpers
├── docker-compose.yml       # Local PostgreSQL 16 + Redis 7 services
├── package.json             # Root npm workspaces manifest and monorepo scripts
├── playwright.config.ts     # Playwright test runner config (Chromium, sequential worker)
├── render.yaml              # Render Blueprint deployment spec (API, Web, Redis, PostgreSQL)
├── AGENTS.md                # Workspace agent rules & GSD context
├── CLIENT_HANDOFF.md        # Client handoff guide
└── README.md                # Project setup & usage documentation
```

## Directory Purposes

**`.github/workflows/`**
- Purpose: Automated CI verification on pushes and PRs to `main`/`master`.
- Contains: `ci.yml` — runs two jobs: `frontend-container` (Docker build & `/login` smoke test) and `test-and-verify` (PostgreSQL 16 + Redis 7 service containers, Prisma generate/migrate/seed, ESLint, TypeScript typecheck, Jest backend unit tests with coverage, full monorepo build, and Chromium Playwright E2E suite).
- Key files: `.github/workflows/ci.yml`
- Subdirectories: None.

**`apps/backend/`**
- Purpose: Multi-tenant NestJS API server, real-time Socket.IO gateway, scheduled cron runner, and BullMQ background worker.
- Contains: `package.json`, `Dockerfile`, `nest-cli.json`, `tsconfig.json`, `tsconfig.build.json`, `eslint.config.mjs`, `.env.example`, `prisma/`, and `src/`.
- Key files: `apps/backend/package.json`, `apps/backend/Dockerfile`, `apps/backend/tsconfig.json`.
- Subdirectories:
  - `apps/backend/prisma/`: `schema.prisma` (32 models, 17 enums), `seed.ts`, and 14 timestamped SQL migrations under `migrations/`.
  - `apps/backend/src/common/`: Cross-cutting NestJS infrastructure shared across all modules.
  - `apps/backend/src/modules/`: 17 domain feature modules.
  - `apps/backend/src/scripts/`: Standalone operational maintenance scripts compiled to `dist/src/scripts/`.

**`apps/backend/src/common/`**
- Purpose: Shared framework infrastructure, security guards, persistence, mail, cloud storage, and pure utility functions.
- Contains:
  - `config/`: Environment config loader & production secret validators (`app.config.ts`).
  - `decorators/`: Custom route/parameter decorators (`current-user.decorator.ts`, `public.decorator.ts`, `roles.decorator.ts`, `require-subscription-tier.decorator.ts`).
  - `filters/`: Global HTTP/Prisma error normalizer (`global-exception.filter.ts`).
  - `guards/`: `jwt-auth.guard.ts`, `roles.guard.ts`, `subscription-tier.guard.ts`, `request-throttler.guard.ts` (+ `.spec.ts` unit tests).
  - `interceptors/`: Uniform JSON response wrapper (`response.interceptor.ts`).
  - `mail/`: Resend HTTPS & Nodemailer SMTP dispatcher (`mail.module.ts`, `mail.service.ts`).
  - `prisma/`: `prisma.module.ts`, `prisma.service.ts`, `tenant-extension.ts` (tested Prisma tenant extension utility), `employee-onboarding-lock.ts`, `initialize-employee-policies.ts`.
  - `request-context/`: `AsyncLocalStorage` request-scoped context (`request-context.module.ts`, `request-context.middleware.ts`, `request-context.service.ts`, `request-context.storage.ts`).
  - `services/`: `data-scope.module.ts`, `data-scope.service.ts` (`ROLE_SCOPE_MAP`, `ROLE_MODULE_MAP`), and `audit-log.service.ts`.
  - `storage/`: Cloudinary upload/validation abstraction (`storage.module.ts`, `storage.service.ts`).
  - `utils/`: Pure helper utilities (`attendance-date.ts`, `attendance-shift.ts`, `employee-dates.ts`, `login-network-location.ts`, `password-policy.ts`, `prisma-conflict.ts`, `request-ip.ts`).

**`apps/backend/src/modules/`**
- Purpose: Self-contained NestJS domain feature modules (each housing `*.module.ts`, `*.controller.ts`, `*.service.ts`, `dto/*.dto.ts`, and colocated `*.spec.ts` Jest unit tests).
- Contains:
  - `ai-assistant/`: Premium Gemini + local deterministic HR policy chat (`/api/v1/ai`).
  - `analytics/`: Role-scoped dashboard KPIs and platform metrics (`/api/v1/analytics`).
  - `attendance/`: Daily punch check-in/out, IP whitelist, remote work permissions, exceptions, Socket.IO `AttendanceGateway` (`/ws/attendance`), and hourly `AttendanceCronService` (`/api/v1/attendance`).
  - `auth/`: Registration, login, JWT cookie rotation, Passport `JwtStrategy`, TOTP 2FA with encrypted secrets (`totp-secret.ts`), account state checks (`account-state.ts`), password reset, and location consent (`/api/v1/auth`).
  - `bulk-import/`: Excel workbook template/validation (`bulk-import.service.ts`) and BullMQ async job runner/reconciler (`bulk-import-jobs.service.ts`) (`/api/v1/employees/bulk`).
  - `companies/`: Tenant company profile & settings (`/api/v1/companies`).
  - `employees/`: Employee directory, onboarding, status lifecycle, emergency contacts, documents, education, experience, and skills (`/api/v1/employees`).
  - `leave/`: Leave types, requests, balances, and `ApprovalEngineService` (`/api/v1/leave`).
  - `notifications/`: Account-scoped notification inbox & read receipts (`/api/v1/notifications`).
  - `organization/`: Nested organizational hierarchy modules: `departments/` (`/api/v1/departments`), `designations/` (`/api/v1/designations`), and `teams/` (`/api/v1/teams`).
  - `payroll/`: Salary structures, `payroll-configuration.ts`, monthly payroll execution, and `PdfService` payslip PDF generator (`/api/v1/payroll`).
  - `resources/`: Equipment/software requisition & multi-step fulfillment workflow (`/api/v1/resources`).
  - `subscriptions/`: Stripe Checkout/Portal, idempotent webhook handler, and daily `SubscriptionCronService` (`/api/v1/subscriptions`).
  - `super-admin/`: Platform tenant administration, Operation Manager password recovery, and audited Support Mode enter/exit (`/api/v1/super-admin`).
  - `work-timer/`: Premium live work timer, break tracking, and 15s overstay alert monitor (`/api/v1/timer`).

**`apps/backend/src/scripts/`**
- Purpose: One-off production/maintenance CLI utilities invoked via npm scripts after build.
- Key files: `bootstrap-admin.ts` (initial `SUPER_ADMIN` provisioning), `encrypt-totp.ts` (legacy TOTP encryption backfill), `revoke-legacy-import-sessions.ts` (dry-run/apply revocation of retired bulk-import passwords).

**`apps/frontend/`**
- Purpose: Next.js 15 App Router web frontend served via Vercel or Docker/Render.
- Contains: `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `tsconfig.json`, `eslint.config.mjs`, `Dockerfile`, `public/`, and `src/`.
- Subdirectories:
  - `apps/frontend/src/app/`: App Router pages and layouts.
    - Public routes: `page.tsx` (auth redirect), `login/page.tsx`, `register/page.tsx`, `forgot-password/page.tsx`, `reset-password/page.tsx`.
    - Authenticated dashboard shell (`dashboard/layout.tsx` + `dashboard/page.tsx`) and 20 feature route segments: `ai-assistant/`, `attendance/` (plus nested `exceptions/` and `history/`), `billing/`, `bulk-import/`, `companies/`, `departments/`, `employees/` (plus dynamic `[id]/`), `leave/`, `leave-approvals/`, `my-attendance/`, `my-leave/`, `my-payslips/`, `my-profile/`, `payroll/`, `payroll-view/`, `resources/`, `settings/`, `support-mode/`, `team-members/`, and `work-timer/`.
  - `apps/frontend/src/components/`: Reusable client components grouped into `auth/` (`auth-experience-panel.tsx`, `recovery-form.tsx`), `layout/` (`header.tsx`, `sidebar.tsx`, `support-mode-banner.tsx`), and `ui/` (`password-input.tsx`, `status-badge.tsx`).
  - `apps/frontend/src/lib/`: Core client infrastructure (`api.ts`, `auth-context.tsx`, `query-provider.tsx`, `attendance-duration.ts`).
  - `apps/frontend/src/middleware.ts`: Next.js middleware for `/api/:path*` client IP HMAC signing.

**`e2e/`**
- Purpose: End-to-end Playwright browser and PostgreSQL regression test suite verifying all 7 roles, multi-tenant isolation, billing, bulk import, payroll, leave, work timer, and UI presentation.
- Contains: Numbered workflow specs (`01-auth-flows.spec.ts` through `17-bulk-import.spec.ts`), per-role specs (`role-*.spec.ts`), targeted UI/feature specs (`ai-assistant-ui.spec.ts`, `auth-presentation.spec.ts`, `payroll-structure.spec.ts`, `super-admin-password-reset.spec.ts`, `theme-button-contrast.spec.ts`), and shared fixtures (`fixture-database.ts`, `role-session.ts`).
- Subdirectories: `e2e/screenshots/` (gitignored visual capture directory).

## Key File Locations

**Entry Points:**
- `apps/backend/src/main.ts` — NestJS API & Socket.IO server bootstrap.
- `apps/backend/src/app.module.ts` — NestJS root module wiring global guards, scheduler, core modules, and 17 feature modules.
- `apps/frontend/src/app/layout.tsx` — Next.js root HTML layout mounting `QueryProvider` and `AuthProvider`.
- `apps/frontend/src/app/dashboard/layout.tsx` — Protected dashboard shell enforcing authentication, `allowedModules`, and role route checks.
- `apps/frontend/src/middleware.ts` — Edge middleware signing client IP headers on `/api/:path*`.

**Configuration:**
- `package.json` — Root workspaces definition and unified `dev:*`, `build`, `lint`, `typecheck`, `prisma:*`, `docker:*`, and `test:*` scripts.
- `apps/backend/src/common/config/app.config.ts` — Typed environment configuration (`DATABASE_URL`, `REDIS_URL`/`REDIS_HOST`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `TOTP_ENCRYPTION_KEY`, `COOKIE_SECRET`, `STRIPE_*`, `CLOUDINARY_*`, `GEMINI_API_KEY`, `RESEND_API_KEY`/`MAIL_*`, `IP_FORWARDING_SECRET`, `TRUSTED_PROXY_CIDRS`).
- `apps/backend/tsconfig.json` — Backend TypeScript strict config with `@common/*` and `@modules/*` path aliases.
- `apps/frontend/next.config.ts` — Next.js proxy rewrites (`/api/:path*`, `/api/attendance-events`), CSP/security headers, and `NEXT_PUBLIC_API_URL` validation.
- `apps/frontend/tsconfig.json` — Frontend TypeScript strict config with `@/*` -> `./src/*` path alias.
- `docker-compose.yml` — Local PostgreSQL 16 and Redis 7 containers.
- `render.yaml` — Render multi-service production blueprint.
- `playwright.config.ts` — Playwright E2E runner configuration.

**Core Logic:**
- `apps/backend/prisma/schema.prisma` — Canonical relational data model (32 models, 17 enums).
- `apps/backend/src/common/services/data-scope.service.ts` — Role-to-scope (`ROLE_SCOPE_MAP`) and role-to-module (`ROLE_MODULE_MAP`) authority.
- `apps/backend/src/modules/auth/strategies/jwt.strategy.ts` — Live database session, `sessionVersion`, and Support Mode validation.
- `apps/backend/src/modules/attendance/attendance.gateway.ts` — Authenticated Socket.IO real-time alert gateway.
- `apps/backend/src/modules/leave/approval-engine.service.ts` — Dynamic 2-step approval chain and probation rules.
- `apps/backend/src/modules/bulk-import/bulk-import-jobs.service.ts` — BullMQ durable import queue, worker, and reconciler.
- `apps/frontend/src/lib/api.ts` — Same-origin HTTP client with single-flight 401 refresh retry.
- `apps/frontend/src/lib/auth-context.tsx` — Client auth state, module manifest, and session recovery state.

**Testing:**
- `apps/backend/src/**/*.spec.ts` — Colocated Jest unit tests (configured via `apps/backend/package.json` with `rootDir: "src"`).
- `e2e/*.spec.ts` — Playwright end-to-end tests with shared DB/session fixtures in `e2e/fixture-database.ts` and `e2e/role-session.ts`.

**Documentation:**
- `README.md` — Repository overview, local setup, and deployment instructions.
- `CLIENT_HANDOFF.md` — Release and operational handoff documentation.
- `UAT_DEFECT_AUDIT.md` — UAT verification audit log.
- `AGENTS.md` — Project rules and GSD workflow guidelines.

## Naming Conventions

**Files:**
- `kebab-case.ts` / `kebab-case.tsx`: Standard for all backend and frontend TypeScript/React source files (e.g., `approval-engine.service.ts`, `auth-experience-panel.tsx`, `status-badge.tsx`).
- NestJS role suffixes: `*.module.ts`, `*.controller.ts`, `*.service.ts`, `*.dto.ts`, `*.guard.ts`, `*.decorator.ts`, `*.filter.ts`, `*.interceptor.ts`, `*.gateway.ts`, `*.cron.ts`, `*.strategy.ts`.
- Next.js App Router conventions: `page.tsx`, `layout.tsx`, `middleware.ts`, `globals.css`, `icon.svg`.
- Test files: `*.spec.ts` colocated alongside backend sources; `NN-feature-name.spec.ts` or `role-<role>.spec.ts` in `e2e/`.
- Prisma migrations: `YYYYMMDDHHMMSS_snake_case_description/migration.sql`.

**Directories:**
- `kebab-case` for all feature modules, route segments, and utility folders (e.g., `ai-assistant/`, `work-timer/`, `bulk-import/`, `leave-approvals/`, `request-context/`).
- Dynamic Next.js route segments use bracket notation (e.g., `apps/frontend/src/app/dashboard/employees/[id]/`).
- NestJS DTOs live in a `dto/` subdirectory inside their owning feature module.

**Special Patterns:**
- Backend path aliases: `@common/*` (`apps/backend/src/common/*`) and `@modules/*` (`apps/backend/src/modules/*`) — mirrored in Jest `moduleNameMapper`.
- Frontend path alias: `@/*` (`apps/frontend/src/*`).
- Shared helper files inside a module omit NestJS suffixes when exporting pure functions/constants (e.g., `account-state.ts`, `totp-secret.ts`, `payroll-configuration.ts`).

## Where to Add New Code

**New Backend Domain Feature:**
- Primary code: Create `apps/backend/src/modules/<feature-name>/` with `<feature-name>.module.ts`, `<feature-name>.controller.ts`, `<feature-name>.service.ts`, and `dto/*.dto.ts`.
- Registration: Import `<FeatureName>Module` in `apps/backend/src/app.module.ts`.
- Database schema: Add models/enums to `apps/backend/prisma/schema.prisma`, generate a migration (`npm run prisma:migrate`), and add tenant-owned models to `TENANT_MODELS` in `apps/backend/src/common/prisma/tenant-extension.ts` if applicable.
- Role/Module wiring: If the feature exposes a new dashboard module, add its module ID to `ROLE_MODULE_MAP` in `apps/backend/src/common/services/data-scope.service.ts`.
- Unit tests: Colocate `<feature-name>.service.spec.ts` and `<feature-name>.controller.spec.ts` in the same module folder.

**New Frontend Dashboard Page / Module:**
- Page route: Create `apps/frontend/src/app/dashboard/<module-id>/page.tsx` (client component using `useQuery`/`useMutation` via `@/lib/api` and `useAuth`).
- Navigation & route guard: Register the nav link in `ALL_NAV_ITEMS` (`apps/frontend/src/components/layout/sidebar.tsx`), add the prefix mapping to `moduleRoutePrefixes` (and `tenantRouteRoles` if role-restricted beyond module manifest) in `apps/frontend/src/app/dashboard/layout.tsx`, and ensure the matching `<module-id>` is listed in `ROLE_MODULE_MAP` on the backend.
- Reusable UI components: Place domain-specific shared components under `apps/frontend/src/components/<domain>/` or generic UI primitives under `apps/frontend/src/components/ui/`.
- E2E tests: Add or extend specs in `e2e/` using `e2e/role-session.ts` and `e2e/fixture-database.ts`.

**New Backend Cross-Cutting Guard, Decorator, or Utility:**
- Guards: `apps/backend/src/common/guards/<name>.guard.ts` (+ `<name>.guard.spec.ts`).
- Decorators: `apps/backend/src/common/decorators/<name>.decorator.ts`.
- Pure utilities: `apps/backend/src/common/utils/<name>.ts` (+ `<name>.spec.ts`).

**New Background Cron Job or Operational Script:**
- Cron job: Add `@Cron(...)` method to an injectable service inside the owning feature module (ensure `ScheduleModule.forRoot()` is active in `AppModule`).
- Operational CLI script: Add `apps/backend/src/scripts/<task-name>.ts` and expose an npm script in `apps/backend/package.json` pointing to `dist/src/scripts/<task-name>.js`.

## Special Directories

**`apps/backend/dist/`**
- Purpose: Compiled NestJS CommonJS build output (`dist/src/main.js`, `dist/src/scripts/*.js`).
- Source: Auto-generated by `npm run build --workspace=apps/backend` (`nest build`).
- Committed: No (in `.gitignore`).

**`apps/backend/coverage/`**
- Purpose: Jest test coverage HTML/LCOV/Clover reports.
- Source: Generated by `npm run test:cov --workspace=apps/backend`.
- Committed: No (in `.gitignore`).

**`apps/frontend/.next/`**
- Purpose: Next.js production/dev build artifacts and generated route types.
- Source: Generated by `next dev` / `next build`.
- Committed: No (in `.gitignore`).

**`apps/backend/prisma/migrations/`**
- Purpose: Ordered SQL schema migration history applied via `prisma migrate deploy` in CI and Render `preDeployCommand`.
- Source: Generated via `prisma migrate dev` / authored SQL migrations.
- Committed: Yes (source of truth for production schema upgrades).

**`e2e/screenshots/`, `test-results/`, `playwright-report/`**
- Purpose: Playwright test execution traces, screenshots, and HTML reports.
- Source: Auto-generated during `npm run test:e2e`.
- Committed: No (in `.gitignore`).

**`.planning/`**
- Purpose: GSD planning state, milestone phases, quick-fix audit trails, and `.planning/codebase/` architecture/structure/stack/conventions maps.
- Source: Maintained by GSD workflows.
- Committed: Yes.

---

*Structure analysis: 2026-11-19*
*Update when directory structure changes*
