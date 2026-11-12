# Codebase Structure

**Analysis Date:** 2026-11-12

## Directory Layout

```
d:/HRMS/
├── .github/                 # Continuous integration and automation workflows
│   └── workflows/ci.yml     # GitHub Actions pipeline (build, test, lint, e2e)
├── .planning/               # GSD planning directory and codebase mapping
│   ├── codebase/            # System architecture, stack, testing, and conventions
│   └── ROADMAP.md           # Milestone roadmap and delivery tracking
├── apps/                    # Monorepo workspaces
│   ├── backend/             # NestJS 10 enterprise REST API and WebSockets
│   │   ├── prisma/          # Prisma relational schema and database seeds
│   │   │   ├── schema.prisma # PostgreSQL data models, enums, indices
│   │   │   └── seed.ts      # Multi-tenant deterministic demo fixtures
│   │   ├── src/             # Backend TypeScript source code
│   │   │   ├── common/      # Shared cross-cutting modules, guards, filters
│   │   │   ├── modules/     # 15 domain-specific business feature modules
│   │   │   ├── app.module.ts # Root NestJS dependency injection graph
│   │   │   └── main.ts      # Application bootstrap entry point
│   │   ├── package.json     # Backend dependencies and build scripts
│   │   └── tsconfig.json    # TypeScript compiler configuration
│   └── frontend/            # Next.js 15 App Router web client
│       ├── src/             # Frontend React and TypeScript source code
│       │   ├── app/         # Next.js App Router pages and layouts
│       │   ├── components/  # Reusable UI widgets and layout shells
│       │   └── lib/         # Client API adapters, providers, auth state
│       ├── package.json     # Frontend dependencies and Next.js scripts
│       ├── tailwind.config.ts # Tailwind CSS design tokens and theme rules
│       └── tsconfig.json    # TypeScript compiler configuration
├── e2e/                     # Playwright end-to-end integration test suites
│   ├── 01-auth-flows.spec.ts # Authentication and session test specs
│   ├── ...                  # Feature and module test specs (01 to 13)
│   └── role-*.spec.ts       # Role-specific verification suites (7 roles)
├── package.json             # Root npm workspace manifest and unified scripts
├── playwright.config.ts     # Playwright test runner and browser configuration
└── README.md                # Project documentation and quickstart instructions
```

---

## Directory Purposes

### `apps/backend/src/common/`
- **Purpose:** Centralized repository for all cross-cutting infrastructure concerns and middleware.
- **Contains:** Guards, filters, interceptors, decorators, database extensions, request context, and platform services.
- **Key files:**
  - `request-context/request-context.service.ts`: Node.js `AsyncLocalStorage` tenant context manager.
  - `prisma/tenant-extension.ts`: Prisma Client query interceptor injecting `companyId` filters.
  - `services/data-scope.service.ts`: Role-to-data-scope mapper (`PLATFORM`, `COMPANY`, `DEPARTMENT`, `TEAM`, `SELF`).
  - `guards/roles.guard.ts`: Role-based access control route guard.
  - `guards/subscription-tier.guard.ts`: Subscription tier feature-gating guard.
  - `filters/global-exception.filter.ts`: Centralized exception and Prisma error sanitizer.
  - `storage/storage.service.ts`: Unified file storage service with Cloudinary and offline fallbacks.

### `apps/backend/src/modules/`
- **Purpose:** Modular business domains implementing the full functional requirements of ZenHR.
- **Contains:** 15 distinct feature modules, each bundling controllers, services, DTOs, interfaces, and unit specs.
- **Key modules:**
  - `auth/`: Authentication, JWT issuance, password hashing, and session management.
  - `companies/`: Tenant company CRUD, subscription binding, and branding settings.
  - `employees/`: Employee lifecycle, demographics, documents, emergency contacts, skills, experience.
  - `organization/`: Department, Designation, and Team structural models and hierarchy.
  - `attendance/`: Punch records, geofence metadata, daily statuses, and nightly absence jobs.
  - `work-timer/`: Active timer sessions, break overstay tracking, and WebSocket broadcasts.
  - `leave/`: Leave quotas, policies, applications, and multi-tier approval workflow engine.
  - `resources/`: Company equipment and physical asset requisition, approval, and fulfillment.
  - `payroll/`: Salary structures, monthly payroll calculation runs, and PDF payslip generation.
  - `subscriptions/`: Stripe checkout integration, subscription tier sync, and webhook processing.
  - `ai-assistant/`: Gemini 2.0 Flash conversational HR agent with grounded policy retrieval.
  - `super-admin/`: Platform-level oversight, company creation, metrics, and Support Mode impersonation.
  - `bulk-import/`: BullMQ-powered asynchronous Excel parsing for workforce onboarding.
  - `notifications/`: Persistent in-app user notifications and WebSocket alerts.
  - `analytics/`: Headcount distribution, turnover rates, and role-scoped organizational analytics.

### `apps/frontend/src/app/`
- **Purpose:** Next.js 15 App Router routing tree representing all visual workflows and screens.
- **Contains:** Layout files, page views, client form controls, and nested dynamic route segments.
- **Key subdirectories:**
  - `login/`, `register/`, `forgot-password/`: Public unauthenticated onboarding flows.
  - `dashboard/`: Protected authenticated workspace wrapped with persistent sidebar and header.
  - `dashboard/employees/[id]/`: Employee 360-degree profile inspection and management.
  - `dashboard/leave/` & `dashboard/leave-approvals/`: Leave request submission and managerial approval views.
  - `dashboard/work-timer/`: Real-time interactive punch timer with active break status.
  - `dashboard/resources/`: Company resource requisition and multi-level approval table.
  - `dashboard/ai-assistant/`: Interactive Gemini conversational chat interface.

### `apps/frontend/src/components/`
- **Purpose:** Modular and reusable UI component primitives.
- **Contains:** Layout wrappers and visual state indicators.
- **Key files:**
  - `layout/sidebar.tsx`: Role-adaptive navigation menu filtering modules by `ROLE_MODULE_MAP`.
  - `layout/header.tsx`: Global navigation header with user avatar, profile menu, and live notifications.
  - `layout/support-mode-banner.tsx`: High-visibility amber banner indicating active Super Admin Support Mode.
  - `ui/status-badge.tsx`: Consistent badge component for statuses (e.g. `PENDING`, `APPROVED`, `FULFILLED`).

### `apps/frontend/src/lib/`
- **Purpose:** Client-side communication, state synchronization, and utility infrastructure.
- **Contains:** Axios/Fetch API wrappers, React Context providers, and TanStack Query configurations.
- **Key files:**
  - `api.ts`: Centralized fetch client handling credentials, base URLs, CSRF headers, and error parsing.
  - `auth-context.tsx`: Authentication state provider tracking current user, role, and Support Mode state.
  - `query-provider.tsx`: TanStack Query cache provider with stale-time and refetch settings.

### `e2e/`
- **Purpose:** Automated browser acceptance test suites executing against full running application.
- **Contains:** Playwright TypeScript test specifications covering all 7 roles across 13 functional chapters.

---

## Key File Locations

**Entry Points:**
- `apps/backend/src/main.ts`: Backend HTTP and WebSocket server initialization.
- `apps/frontend/src/app/layout.tsx`: Root HTML shell and global provider tree.
- `apps/frontend/src/app/page.tsx`: Root client-side routing redirect (checks session -> `/dashboard` or `/login`).

**Configuration:**
- `package.json`: Root monorepo configuration with npm workspaces.
- `apps/backend/tsconfig.json`: Backend TypeScript compiler options (strict mode, path aliases).
- `apps/frontend/tsconfig.json`: Frontend Next.js compiler options (strict mode, path aliases).
- `apps/frontend/tailwind.config.ts`: Tailwind design system tokens, color palettes, animations.
- `playwright.config.ts`: Playwright E2E test runner configuration.

**Core Logic & Schema:**
- `apps/backend/prisma/schema.prisma`: Complete PostgreSQL relational data schema.
- `apps/backend/src/common/services/data-scope.service.ts`: System-wide data visibility boundary engine.
- `apps/backend/src/common/prisma/tenant-extension.ts`: Automatic tenant isolation injection logic.
- `apps/backend/src/modules/leave/approval-engine.service.ts`: Multi-stage managerial approval pipeline.

**Testing:**
- `apps/backend/src/**/*.spec.ts`: Unit and service integration tests (32 suites).
- `e2e/*.spec.ts`: Playwright full browser acceptance tests (20 suites).

---

## Naming Conventions

**Files:**
- `kebab-case.ts` / `kebab-case.tsx`: Standard for all source files, controllers, services, and modules.
- `*.module.ts`: NestJS module declaration.
- `*.controller.ts`: NestJS HTTP controller.
- `*.service.ts`: NestJS injectable domain service.
- `*.dto.ts`: Data Transfer Object class schema.
- `*.guard.ts`: NestJS authorization or execution guard.
- `*.spec.ts`: Unit test file matching corresponding implementation file.
- `page.tsx` & `layout.tsx`: Next.js App Router route segments.

**Directories:**
- `kebab-case`: Standard across all folders (`ai-assistant`, `work-timer`, `request-context`).
- `[id]`: Next.js dynamic path segment (e.g. `apps/frontend/src/app/dashboard/employees/[id]/`).

**Code Symbols:**
- `PascalCase`: Classes, interfaces, types, enums, React components (`EmployeesController`, `DataScopeService`, `UserRole`, `StatusBadge`).
- `camelCase`: Method names, function names, object properties, variable instances (`applyScope()`, `currentUser`).
- `UPPER_SNAKE_CASE`: Global constants, configuration keys, fixed lookup tables (`ROLE_SCOPE_MAP`, `TENANT_MODELS`).

---

## Where to Add New Code

**New Module / Domain Feature:**
- **Backend:** Create `apps/backend/src/modules/<feature-name>/` containing:
  - `<feature-name>.module.ts`: Module declaration imported into `apps/backend/src/app.module.ts`.
  - `<feature-name>.controller.ts`: Route endpoints with `@UseGuards()`, `@Roles()`.
  - `<feature-name>.service.ts`: Business logic and `DataScopeService` integration.
  - `dto/`: Input validation DTOs with `class-validator` annotations.
  - `<feature-name>.service.spec.ts`: Unit tests with mocked PrismaService.
- **Frontend:** Create `apps/frontend/src/app/dashboard/<feature-name>/page.tsx` utilizing `api.ts` and TanStack Query.
- **Permissions:** Register module identifier in `ROLE_MODULE_MAP` inside `apps/backend/src/common/services/data-scope.service.ts`.
- **Tenant Scope:** If the feature introduces a new Prisma model, add its name to `TENANT_MODELS` in `apps/backend/src/common/prisma/tenant-extension.ts`.

**New Shared Component or UI Utility:**
- **Component:** Place in `apps/frontend/src/components/ui/` or `apps/frontend/src/components/layout/`.
- **Helper / API method:** Place in `apps/frontend/src/lib/api.ts` or `apps/frontend/src/lib/utils.ts`.

**New E2E Test Suite:**
- Add `<number>-<feature-name>.spec.ts` inside `e2e/` utilizing Playwright fixtures and test credentials.

---

## Special Directories

- `.planning/`: GSD project state, roadmap, phase definitions, and codebase mapping documents. Committed to git.
- `apps/backend/dist/`: NestJS compiled JavaScript build artifacts. Ignored via `.gitignore`.
- `apps/frontend/.next/`: Next.js compiled server and client bundles. Ignored via `.gitignore`.
- `node_modules/`: Monorepo shared third-party dependencies. Ignored via `.gitignore`.
- `test-results/`: Playwright test run output, trace recordings, and failure screenshots. Ignored via `.gitignore`.

---

*Structure analysis: 2026-11-12*
*Update when directory structure changes*
