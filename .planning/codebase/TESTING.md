# Testing Patterns

**Analysis Date:** 2026-11-12

## Test Framework

### Backend Unit & Integration Tests
- **Runner:** Jest 29.7.0 (`ts-jest` 29.2.5)
- **Configuration:** Embedded in `apps/backend/package.json` (`"jest"` field)
- **Environment:** Node.js (`testEnvironment: "node"`)
- **Assertion Library:** Jest built-in `expect` matchers (`toBe`, `toEqual`, `toThrow`, `toHaveBeenCalledWith`, `resolves`, `rejects`)

### End-to-End (E2E) Browser Tests
- **Runner:** Playwright 1.64.1
- **Configuration:** `playwright.config.ts` located in project root
- **Browser:** Chromium Desktop (viewport: 1280x800)
- **Base URL:** `http://localhost:3000`

### Test Execution Commands

```bash
# Backend unit tests
npm run test:backend                               # Run all backend Jest unit specs
npm --prefix apps/backend test                     # Alternative direct backend test invocation
npm --prefix apps/backend test -- --watch          # Run backend tests in watch mode
npm --prefix apps/backend test -- src/modules/employees/employees.service.spec.ts # Single spec file
npm --prefix apps/backend run test:cov             # Generate test coverage report

# End-to-End tests
npm run test:e2e                                   # Execute all Playwright E2E suites
npx playwright test e2e/01-auth-flows.spec.ts     # Run a single E2E spec suite
npx playwright test --headed                       # Run tests with visible browser window
npx playwright test --debug                        # Launch Playwright step-by-step inspector
```

---

## Test File Organization

### Organization Strategy
- **Backend Unit Tests:** Collocated alongside the source code (`*.spec.ts`) in `apps/backend/src/`. This guarantees immediate discovery and synchronization during refactoring.
- **E2E Tests:** Grouped in a dedicated root-level `e2e/` directory, segregated into sequenced functional chapters (`01` through `13`) and role-specific validation suites (`role-*.spec.ts`).

### File Layout

```
apps/backend/src/
├── common/
│   ├── guards/
│   │   ├── roles.guard.ts
│   │   ├── roles.guard.spec.ts
│   │   ├── subscription-tier.guard.ts
│   │   └── subscription-tier.guard.spec.ts
│   ├── prisma/
│   │   ├── tenant-extension.ts
│   │   └── tenant-extension.spec.ts
│   ├── services/
│   │   ├── data-scope.service.ts
│   │   └── data-scope.service.spec.ts
│   └── storage/
│       ├── storage.service.ts
│       └── storage.service.spec.ts
└── modules/
    ├── attendance/
    │   ├── attendance.controller.ts
    │   ├── attendance.controller.spec.ts
    │   ├── attendance.service.ts
    │   └── attendance.service.spec.ts
    └── leave/
        ├── approval-engine.service.ts
        ├── approval-engine.service.spec.ts
        ├── leave.service.ts
        └── leave.service.spec.ts

e2e/
├── 01-auth-flows.spec.ts
├── 02-super-admin.spec.ts
├── 03-operation-manager.spec.ts
├── 04-company-admin-ceo.spec.ts
├── 05-hr-manager.spec.ts
├── 06-dept-mgr-and-team-lead.spec.ts
├── 07-employee-self-service.spec.ts
├── 08-leave-lifecycle.spec.ts
├── 09-work-timer-and-punch.spec.ts
├── 10-workforce-and-org-management.spec.ts
├── 11-payroll-and-exceptions-execution.spec.ts
├── 12-resources-and-ai-assistant.spec.ts
├── 13-security-and-registration.spec.ts
├── role-super-admin.spec.ts
├── role-operation-manager.spec.ts
├── role-company-admin.spec.ts
├── role-hr-manager.spec.ts
├── role-dept-manager.spec.ts
├── role-team-lead.spec.ts
└── role-employee.spec.ts
```

---

## Test Structure

### Backend Suite Pattern (Jest)

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { EmployeesService } from './employees.service';
import { PrismaService } from '@common/prisma/prisma.service';
import { DataScopeService } from '@common/services/data-scope.service';

describe('EmployeesService', () => {
  let service: EmployeesService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const mockPrisma = {
      employee: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmployeesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: DataScopeService, useValue: { applyScope: jest.fn().mockReturnValue({}) } },
      ],
    }).compile();

    service = module.get<EmployeesService>(EmployeesService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return scoped employees for the requesting user', async () => {
      // Arrange
      const mockEmployees = [{ id: 'emp-1', firstName: 'Evan', lastName: 'Wright' }];
      prisma.employee.findMany.mockResolvedValue(mockEmployees as any);

      // Act
      const result = await service.findAll({ id: 'user-1', role: 'COMPANY_ADMIN', companyId: 'comp-1' } as any);

      // Assert
      expect(result).toEqual(mockEmployees);
      expect(prisma.employee.findMany).toHaveBeenCalledTimes(1);
    });
  });
});
```

### ExecutionContext Mocking Pattern (Guards)

```typescript
const createMockContext = (user?: Record<string, unknown>, isPublic = false): ExecutionContext => {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
};
```

---

## Mocking Guidelines

### What to Mock
- **Database Access (`PrismaService`):** Mock all Prisma entity delegates (`findFirst`, `findMany`, `create`, `update`, `$transaction`) in unit tests to ensure fast, isolated execution.
- **External Third-Party APIs:**
  - Cloudinary SDK / File Storage (`StorageService`)
  - Stripe SDK payment checkout and customer portal
  - Nodemailer email transport (`MailService`)
  - Google GenAI SDK (`@google/genai`)
- **Queue Workers:** BullMQ queue dispatchers (`bulkImportQueue.add`).

### What NOT to Mock
- **Pure Domain & Policy Logic:**
  - Date and time calculations (working hours, probation expiration, break durations).
  - Payroll math (gross salary, allowances, tax deductions, net pay).
  - Data scope translation logic in `DataScopeService`.
- **Validation DTOs:** Validation pipes and class-validator decorators should run against real objects.

---

## Fixtures & Test Data

### Database Seeding (`apps/backend/prisma/seed.ts`)
- Provides deterministic multi-tenant test data:
  - **Company 1:** Acme Corporation (Tier: `PREMIUM`)
  - **Company 2:** Globex Corp (Tier: `BASIC`)
  - **Pre-configured Users:** Standard accounts for all 7 roles across companies (e.g. `superadmin@zenhr.com`, `tina.lopez@acme.com`, `evan.wright@acme.com`).
  - **Sample Records:** Configured departments, designations, shifts, attendance punch logs, and leave requests.

---

## Coverage & Test Types

### 1. Unit Tests (32 suites in `apps/backend/src/`)
- Validate isolated business logic in controllers, services, guards, interceptors, and Prisma extensions.
- Fast execution (< 50ms per test).

### 2. Tenant Isolation Tests (`tenant-extension.spec.ts`)
- Explicitly test that Prisma queries inject `companyId` into queries and that unauthorized cross-tenant records cannot be read or modified.

### 3. Role-Based E2E Tests (20 suites in `e2e/`)
- Validate complete user workflows inside a real Chromium browser against the Next.js frontend and NestJS backend.
- Cover all 7 roles:
  1. Super Admin
  2. Operation Manager
  3. Company Admin
  4. HR Manager
  5. Department Manager
  6. Team Lead
  7. Employee

---

*Testing analysis: 2026-11-12*
*Update when test patterns change*
