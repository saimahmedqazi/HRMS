# Testing Patterns

**Analysis Date:** 2026-11-19

## Test Framework

**Backend Unit Runner:**
- Jest 29.7.0 with `ts-jest` 29.2.5 and `@nestjs/testing` 10.4.1
- Config: inline `"jest"` block in `apps/backend/package.json` (`rootDir: "src"`, `testRegex: ".*\\.spec\\.ts$"`, `testEnvironment: "node"`, `moduleNameMapper` for `@common/*` and `@modules/*`)

**E2E & Database Regression Runner:**
- Playwright (`@playwright/test` ^1.64.1)
- Config: `playwright.config.ts` in repository root (`testDir: "./e2e"`, `timeout: 60000`, `expect.timeout: 10000`, `fullyParallel: false`, `workers: 1`, `retries: 0`, single `chromium` Desktop Chrome 1280x800 project, `trace: "retain-on-failure"`, `screenshot: "only-on-failure"`)

**Frontend Unit Runner:**
- None configured — `apps/frontend/package.json` has no Jest/Vitest/Testing Library setup; frontend behavior is verified via Playwright specs (`e2e/`) using both mocked `page.route()` APIs and live backend/PostgreSQL sessions

**Assertion Libraries:**
- Jest built-in `expect` (`toBe`, `toEqual`, `toContain`, `toThrow`, `rejects.toThrow`, `rejects.toBeInstanceOf`, `toHaveBeenCalledWith`, `expect.objectContaining`)
- Playwright built-in `expect` (`toBeVisible`, `toContainText`, `toHaveURL`, `toHaveCount`, `toHaveCSS`, `toBeEnabled`, `toBeDisabled`)

**Run Commands:**
```bash
npm run test:backend                                              # Run all 44 backend Jest suites
npm run test --workspace=apps/backend -- --runInBand --coverage   # CI backend run with coverage
npm run test:watch --workspace=apps/backend                       # Backend Jest watch mode
npm run test --workspace=apps/backend -- resources.service.spec   # Single backend spec
npm run test:e2e                                                  # Run all 29 Playwright specs
npm run test:e2e -- --project chromium e2e/auth-presentation.spec.ts  # Single Playwright spec
```

## Test File Organization

**Location:**
- Backend unit specs are co-located alongside source files inside `apps/backend/src/` (44 `*.spec.ts` files across `common/` and `modules/`)
- Playwright browser and PostgreSQL regression specs live in root `e2e/` (29 `*.spec.ts` files + 2 shared helpers)

**Naming:**
- Backend specs match the target source filename with `.spec.ts` (`employees.service.spec.ts`, `employees.controller.spec.ts`, `attendance.cron.spec.ts`, `roles.guard.spec.ts`)
- Focused regression specs append a descriptive topic suffix (`apps/backend/src/modules/payroll/payroll.controller.platform-scope.spec.ts`)
- E2E specs use three naming groups under `e2e/`:
  - Numbered end-to-end flows: `e2e/01-auth-flows.spec.ts` through `e2e/17-bulk-import.spec.ts`
  - Role-specific acceptance suites (10-test suites per role): `e2e/role-super-admin.spec.ts`, `e2e/role-operation-manager.spec.ts`, `e2e/role-company-admin.spec.ts`, `e2e/role-hr-manager.spec.ts`, `e2e/role-dept-manager.spec.ts`, `e2e/role-team-lead.spec.ts`, `e2e/role-employee.spec.ts`
  - Targeted UI/security regression specs: `e2e/role-module-guard.spec.ts`, `e2e/auth-presentation.spec.ts`, `e2e/ai-assistant-ui.spec.ts`, `e2e/super-admin-password-reset.spec.ts`, `e2e/theme-button-contrast.spec.ts`

**Structure:**
```
apps/backend/src/
  common/
    config/app.config.spec.ts
    guards/roles.guard.spec.ts
    prisma/tenant-extension.spec.ts
    services/data-scope.service.spec.ts
    utils/attendance-shift.spec.ts
  modules/
    ai-assistant/ai-assistant.service.spec.ts
    payroll/
      payroll.controller.spec.ts
      payroll.controller.platform-scope.spec.ts
      payroll.service.spec.ts
      pdf.service.spec.ts
    resources/
      resources.controller.spec.ts
      resources.service.spec.ts
e2e/
  fixture-database.ts              # Disposable loopback PrismaClient helper
  role-session.ts                  # Shared UI sign-in & cookie session helper
  01-auth-flows.spec.ts ... 17-bulk-import.spec.ts
  role-*.spec.ts                   # Per-role UAT + module guard suites
  auth-presentation.spec.ts        # Auth split-panel & testimonial carousel tests
  ai-assistant-ui.spec.ts          # Mocked AI assistant UI tests
  theme-button-contrast.spec.ts    # Light-mode contrast regression test
```

## Test Structure

**Backend Suite Organization (NestJS `TestingModule` — 16 of 44 specs):**
```typescript
describe('ResourcesService', () => {
  let service: ResourcesService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      employee: { findFirst: jest.fn(), findUnique: jest.fn() },
      resourceRequest: { create: jest.fn(), findMany: jest.fn() },
      $transaction: jest.fn((callback) => callback(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResourcesService,
        DataScopeService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<ResourcesService>(ResourcesService);
  });

  describe('getResourceRequests', () => {
    it.each([UserRole.SUPER_ADMIN, UserRole.OPERATION_MANAGER])(
      'returns no tenant requests for platform role %s without a company context',
      async (role) => {
        await expect(service.getResourceRequests('', { id: 'user-1', role })).resolves.toEqual([]);
        expect(prisma.resourceRequest.findMany).not.toHaveBeenCalled();
      },
    );
  });
});
```

**Backend Direct Instantiation (28 of 44 specs):**
- Lighter specs for controllers, guards, utilities, and crons construct the class directly (`new PayrollController(payrollService)`, `new RolesGuard(reflector)`, `new AttendanceCronService(db as unknown as PrismaService)`) and clear mocks in `beforeEach(() => jest.clearAllMocks())`

**Playwright E2E Suite Organization:**
- Role suites call `useRoleSession(email, password)` from `e2e/role-session.ts` inside `test.describe(...)` to sign in once in `test.beforeAll`, cache cookies, and hydrate each test in `test.beforeEach`
- Isolated UI tests use `page.route('**/api/v1/**', ...)` without requiring seeded auth or mutating database state
- Database-backed tests generate unique fixture identifiers with `randomUUID()`, mutate/verify live PostgreSQL records via `openFixtureDatabase()`, and clean up created rows inside `try ... finally`

**Patterns:**
- Use `beforeEach` to reset mocks/state and `afterEach` to restore fake timers (`jest.useRealTimers()`) or spied globals (`spy.mockRestore()`)
- Use `it.each(...)` extensively for role matrices, edge-case inputs, and tenant isolation tables (e.g., `ai-assistant.service.spec.ts`, `resources.service.spec.ts`)
- Run Playwright serially (`workers: 1`, `fullyParallel: false`) because full-stack specs share a single seeded PostgreSQL instance and auth rate-limit window

## Mocking

**Backend Mocking Framework:**
- Jest built-in mocking (`jest.fn()`, `jest.spyOn()`, `jest.mock()`, `jest.mocked()`, `jest.useFakeTimers()`)
- Module-level `jest.mock(...)` is used sparingly (2 specs: `@google/genai` in `apps/backend/src/modules/ai-assistant/ai-assistant.service.spec.ts` and storage/external SDKs); most dependencies are injected as plain mock objects `{ provide: PrismaService, useValue: prisma }`
- Prisma transactions are mocked synchronously by passing the mock `prisma` client to the callback: `$transaction: jest.fn((callback) => callback(prisma))`
- Guard specs test real controller decorator metadata via `new Reflector()` against controller prototypes (e.g., `LeaveController.prototype.getLeaveTypes` in `apps/backend/src/common/guards/roles.guard.spec.ts`)

**Playwright Mocking Patterns:**
- 16 of 29 E2E specs intercept API calls via `page.route('**/api/v1/**', ...)` to verify frontend route guards, error-page handling, session recovery, light-mode button contrast, and AI Assistant UI without backend side effects
- Time-dependent browser UI (the testimonial carousel in `e2e/auth-presentation.spec.ts`) uses `await page.clock.install()` and `await page.clock.fastForward(6_500)` rather than real sleeps

**What to Mock:**
- `PrismaService`, `ConfigService`, `MailService`, `StorageService`, Stripe, and `@google/genai` in backend unit tests
- System clock (`jest.useFakeTimers()` + `jest.setSystemTime()`) for cron/shift timezone logic (`attendance.cron.spec.ts`) and `page.clock` for frontend intervals (`auth-presentation.spec.ts`)
- HTTP responses via `page.route()` for deterministic UI/error-state Playwright tests

**What NOT to Mock:**
- `DataScopeService` when verifying tenant/role filtering inside domain services (e.g., `ResourcesService` injects the real `DataScopeService`)
- Pure utility functions (`attendance-shift.ts`, `request-ip.ts`, `totp-secret.ts`, Excel buffer generation via `xlsx` in `bulk-import.service.spec.ts`)
- PostgreSQL foreign-key and composite-key constraints in `e2e/16-tenant-relationships.spec.ts` (tested directly against real PostgreSQL)

## Fixtures and Factories

**Backend Test Data:**
- Inline helper factories and `mockCompanyId` / `mockUser` constants are defined inside each spec file rather than a shared backend factory folder (e.g., `createMockExcelBuffer(rows)` in `apps/backend/src/modules/bulk-import/bulk-import.service.spec.ts`, `createMockContext(user)` in `apps/backend/src/common/guards/roles.guard.spec.ts`)

**E2E Shared Helpers (`e2e/`):**
- `e2e/fixture-database.ts`: `openFixtureDatabase()` reads `ZENHR_E2E_DATABASE_URL`, enforces that the connection points strictly to a loopback PostgreSQL host (`127.0.0.1`, `localhost`, `[::1]`), and returns a scoped `PrismaClient` (used in 10 E2E specs)
- `e2e/role-session.ts`:
  - `signInThroughUi(page, email, password)` performs UI login, retries once on `429` using `retry-after-short` / `retry-after` headers, and logs auth diagnostics on failure
  - `useRoleSession(email, password)` logs in once per `describe` block in `beforeAll` and restores session cookies in `beforeEach` (used in 12 E2E specs)
- `apps/backend/prisma/seed.ts`: seeds deterministic demo tenants (`acme-corp` PREMIUM, `globex-logistics` BASIC) and all 7 roles for local/CI Playwright runs, also guarded against non-loopback or production databases

## Coverage

**Requirements:**
- No hard numeric coverage threshold is enforced in `apps/backend/package.json` (`coverageThreshold` is not configured)
- CI executes `npm run test --workspace=apps/backend -- --runInBand --coverage` on every push/PR to `main`/`master` (`.github/workflows/ci.yml`) for visibility

**Configuration:**
- `collectCoverageFrom: ["**/*.(t|j)s"]`, `coverageDirectory: "../coverage"` inside `apps/backend/package.json`
- Backend production build (`apps/backend/tsconfig.build.json`) excludes `**/*spec.ts`

**View Coverage:**
```bash
npm run test:cov --workspace=apps/backend
# Reports written to apps/backend/coverage/
```

**Observed Coverage Gaps:**
- **Frontend unit/component tests:** No unit test runner exists in `apps/frontend`; pure helpers (`apps/frontend/src/lib/api.ts`, `apps/frontend/src/lib/attendance-duration.ts`) and components are covered only indirectly through Playwright E2E specs
- **Backend files without co-located `.spec.ts` files:**
  - Common infrastructure: `apps/backend/src/common/filters/global-exception.filter.ts`, `apps/backend/src/common/interceptors/response.interceptor.ts`, `apps/backend/src/common/guards/jwt-auth.guard.ts`, `apps/backend/src/common/prisma/prisma.service.ts`, `apps/backend/src/common/request-context/request-context.service.ts`, `apps/backend/src/common/services/audit-log.service.ts`
  - Modules: `apps/backend/src/modules/companies/companies.service.ts`, `apps/backend/src/modules/companies/companies.controller.ts`, `apps/backend/src/modules/organization/designations/designations.service.ts`, `apps/backend/src/modules/organization/designations/designations.controller.ts`, `apps/backend/src/modules/auth/auth.controller.ts`, `apps/backend/src/modules/ai-assistant/ai-assistant.controller.ts`, `apps/backend/src/modules/bulk-import/bulk-import.controller.ts`, `apps/backend/src/modules/subscriptions/subscriptions.controller.ts`
- **Tenant Prisma extension runtime behavior:** `apps/backend/src/common/prisma/tenant-extension.spec.ts` tests only membership in the `TENANT_MODELS` set, not the `$extends` query-injection hooks

## Test Types

**Unit Tests (44 Jest specs in `apps/backend/src/`):**
- Fast, isolated Node tests covering services, controllers, guards, crons, WebSocket gateways, config parsing, TOTP crypto, PDF generation, and AI Assistant intent/privacy policy rules
- Recent additions emphasize security and policy regression coverage: AI pay/leave intent and third-party privacy refusal (`ai-assistant.service.spec.ts`), tenant isolation on resource requests (`resources.service.spec.ts`), platform-role payroll scope enforcement (`payroll.controller.platform-scope.spec.ts`), and role-route metadata (`roles.guard.spec.ts`)

**PostgreSQL Constraint & Integration Tests (`e2e/` with `openFixtureDatabase()`):**
- Run inside Playwright against live Postgres 16 + Redis 7 in CI (`.github/workflows/ci.yml`)
- Verify composite tenant foreign keys (`e2e/16-tenant-relationships.spec.ts` asserting Prisma `P2003` errors on cross-tenant updates), password reset token revocation (`e2e/14-session-recovery.spec.ts`), bulk Excel import queues (`e2e/17-bulk-import.spec.ts`), and Support Mode audits

**Browser E2E & UI Regression Tests (29 Playwright specs in `e2e/`):**
- Cover full-stack role workflows for all 7 roles (`e2e/role-*.spec.ts`), route/module manifest gating (`e2e/role-module-guard.spec.ts`), auth layout & testimonial carousel controls/autoplay (`e2e/auth-presentation.spec.ts`), AI UI model-hiding (`e2e/ai-assistant-ui.spec.ts`), and light-mode contrast (`e2e/theme-button-contrast.spec.ts`)
- CI (`.github/workflows/ci.yml`) also runs a Dockerized `Frontend Container Smoke Test` job verifying the production Next.js container serves `/login`

## Common Patterns

**Async & Exception Testing:**
```typescript
await expect(
  service.createResourceRequest(mockCompanyId, mockUserId, dto),
).rejects.toThrow(NotFoundException);

await expect(controller.getPayslips(superAdmin))
  .rejects.toBeInstanceOf(ForbiddenException);
```

**Tenant Isolation & Role-Scope Verification:**
- Assert both negative access (throws `ForbiddenException` or returns `[]` without invoking Prisma) and exact `where` clauses containing `companyId` and `deletedAt: null`
- In Playwright route-guard specs (`e2e/role-module-guard.spec.ts`), spy on `page.on('request', ...)` to prove restricted pages never fire unauthorized background API fetches

**Deterministic Clock & Timer Testing:**
```typescript
// Backend Jest cron test (attendance.cron.spec.ts)
beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
afterEach(() => jest.useRealTimers());
jest.setSystemTime(new Date('2026-11-10T19:00:00Z'));

// Frontend Playwright carousel test (auth-presentation.spec.ts)
await page.clock.install();
await page.goto('/login');
await page.clock.fastForward(6_500);
```

**Snapshot Testing:**
- Not used anywhere in the repository (`0` snapshot assertions); prefer explicit semantic assertions (`getByRole`, `toContainText`, `toEqual`, `toHaveBeenCalledWith`)

---

*Testing analysis: 2026-11-19*
*Update when test patterns change*
