# Coding Conventions

**Analysis Date:** 2026-11-12

## Naming Patterns

### Files
- **Backend Source Files:** `kebab-case.ts` with explicit architectural role suffixes:
  - `*.controller.ts` for NestJS HTTP route controllers (e.g. `apps/backend/src/modules/employees/employees.controller.ts`)
  - `*.service.ts` for domain business services (e.g. `apps/backend/src/modules/leave/leave.service.ts`)
  - `*.module.ts` for NestJS module manifests (e.g. `apps/backend/src/modules/payroll/payroll.module.ts`)
  - `*.dto.ts` for request validation classes (e.g. `create-employee.dto.ts`)
  - `*.guard.ts` for authentication and authorization guards (e.g. `roles.guard.ts`)
  - `*.decorator.ts` for custom parameter or route decorators (e.g. `current-user.decorator.ts`)
  - `*.filter.ts` for exception handling filters (e.g. `global-exception.filter.ts`)
  - `*.interceptor.ts` for response modification interceptors (e.g. `response.interceptor.ts`)
- **Backend Test Files:** `*.spec.ts` placed adjacent to the file being tested (e.g. `data-scope.service.spec.ts`).
- **Frontend Source Files:**
  - `page.tsx` and `layout.tsx` for Next.js App Router route segments.
  - `kebab-case.tsx` for layout and UI components (e.g. `apps/frontend/src/components/layout/header.tsx`, `status-badge.tsx`).
- **E2E Test Files:** Numbered sequence `01-*.spec.ts` to `13-*.spec.ts` and `role-*.spec.ts` in `e2e/`.

### Functions & Methods
- **Naming:** `camelCase` for all functions and class methods (e.g. `applyScope()`, `calculatePayroll()`, `findEmployeeById()`).
- **Async Functions:** Return explicit `Promise<T>` return types; no special async prefixes or suffixes (`async` keyword used in signature).
- **Frontend Event Handlers:** Prefixed with `handle` or named for domain action (e.g. `handlePunch()`, `onSubmit()`, `handleStatusChange()`).

### Variables & Constants
- **Variables & Properties:** `camelCase` for local variables, instance properties, and object keys (`companyId`, `employeeRecord`, `tokenPayload`).
- **Constants:** `UPPER_SNAKE_CASE` for global constant maps, configuration keys, and model lists (`ROLE_SCOPE_MAP`, `ROLE_MODULE_MAP`, `TENANT_MODELS`).

### Types & Enums
- **Interfaces & Types:** `PascalCase` with no `I` prefix (e.g. `AuthenticatedUser`, `DataScopeFilter`, `PayrollCalculationResult`).
- **Classes & DTOs:** `PascalCase` with explicit DTO suffix (e.g. `CreateEmployeeDto`, `UpdateLeaveStatusDto`).
- **Enums:** `PascalCase` for enum names, `UPPER_SNAKE_CASE` for enum values (e.g. `UserRole.COMPANY_ADMIN`, `LeaveStatus.APPROVED`, `SubscriptionTier.PREMIUM`).

---

## Code Style

### TypeScript Strictness
- `strict: true` enabled across all workspaces (`apps/backend/tsconfig.json`, `apps/frontend/tsconfig.json`).
- `noImplicitAny: true`: Implicit `any` is strictly prohibited.
- `strictNullChecks: true`: Null and undefined checks are enforced at compile time.
- `forceConsistentCasingInFileNames: true`: Prevents case-sensitivity issues across Windows, Linux, and macOS.

### Formatting
- **Indentation:** 2 spaces (no tabs).
- **Line Length:** Target 100 characters per line.
- **Quotes:** Single quotes for TypeScript code; double quotes for JSON.
- **Semicolons:** Required at the end of all statements.
- **Trailing Commas:** Multi-line objects and arrays use trailing commas to reduce diff noise.

### Linting
- **Tool:** ESLint with TypeScript parser (`@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`).
- **Execution:** Run via `npm run lint` or `npm --prefix apps/backend run lint`.

---

## Import Organization

### Import Ordering
1. **External Node & Framework Libraries:**
   ```typescript
   import { Injectable, BadRequestException, Logger } from '@nestjs/common';
   import { UserRole, DataScope } from '@prisma/client';
   ```
2. **Internal Path-Aliased Modules:**
   ```typescript
   import { PrismaService } from '@common/prisma/prisma.service';
   import { DataScopeService } from '@common/services/data-scope.service';
   import { AuthenticatedUser } from '@common/decorators/current-user.decorator';
   ```
3. **Relative Imports:**
   ```typescript
   import { CreateEmployeeDto } from './dto/create-employee.dto';
   import { EmployeeEntity } from './entities/employee.entity';
   ```
4. **Type-Only Imports:**
   ```typescript
   import type { Request, Response } from 'express';
   ```

### Path Aliases
- **Backend (`apps/backend/tsconfig.json`):**
  - `@common/*` maps to `apps/backend/src/common/*`
  - `@modules/*` maps to `apps/backend/src/modules/*`
- **Frontend (`apps/frontend/tsconfig.json`):**
  - `@/*` maps to `apps/frontend/src/*`

---

## Error Handling

### Backend Error Strategy
- Centralized exception bubbling: Services and controllers throw built-in NestJS HTTP exceptions:
  - `BadRequestException` (400) for validation and invalid workflow state.
  - `UnauthorizedException` (401) for missing, invalid, or expired authentication tokens.
  - `ForbiddenException` (403) for RBAC violations or cross-tenant scope breaches.
  - `NotFoundException` (404) for non-existent entities.
  - `ConflictException` (409) for duplicate email or business identifier violations.
- **Global Exception Filter (`GlobalExceptionFilter`):**
  - Intercepts all exceptions, Prisma database errors (`P2002`, `P2025`), and unhandled runtime exceptions.
  - Emits a standardized error envelope:
    ```json
    {
      "success": false,
      "statusCode": 400,
      "message": "Employee record already exists with this national ID",
      "error": "Conflict",
      "timestamp": "2026-11-12T00:00:00.000Z",
      "path": "/api/v1/employees"
    }
    ```

### Frontend Error Strategy
- Centralized fetch adapter (`apps/frontend/src/lib/api.ts`) catches failed HTTP responses, unwraps `error.message`, and rejects with a normalized error object.
- UI components catch errors to display inline field validation messages or toast notifications.

---

## Logging

### Backend Logging
- **Framework:** NestJS built-in `Logger` class.
- **Instantiation:** Dedicated context string per class:
  ```typescript
  export class EmployeesService {
    private readonly logger = new Logger(EmployeesService.name);

    async createEmployee(...) {
      this.logger.log(`Creating employee for company ${companyId}`);
    }
  }
  ```
- **Audit Logging:** Administrative state changes (Support Mode activation, role reassignments, payroll disbursement) invoke `AuditLogService` to create persistent database records.
- **Rules:** Never use raw `console.log()` in backend services; never log credentials, JWT tokens, or plaintext passwords.

---

## Comments & Documentation

- **Why, Not What:** Comments explain business invariants, legal regulations (e.g. probation duration, statutory overtime, tax deductions), and multi-tenant security guarantees.
- **JSDoc / TSDoc:** Used on public service methods to document parameter expectations and multi-tenant scoping behaviors.
- **TODO Pattern:** Format as `// TODO: description` referencing architectural improvements or future milestone items.

---

## Function & Class Design

- **Dependency Injection:** Constructors declare dependencies as `private readonly` with explicit type annotations:
  ```typescript
  constructor(
    private readonly prisma: PrismaService,
    private readonly dataScopeService: DataScopeService,
  ) {}
  ```
- **Guard Clauses:** Functions validate preconditions and throw exceptions early to minimize nesting.
- **Explicit Return Types:** All public methods in services, controllers, and helpers specify their return type.
- **DTO Validation:** All incoming mutation payloads must be backed by a class decorated with `class-validator` rules (`@IsString()`, `@IsEmail()`, `@IsOptional()`).

---

## React & Frontend Patterns

- **Client Directives:** Files using React hooks (`useState`, `useEffect`, `useQuery`) explicitly declare `'use client'` at the top of the file.
- **Form Handling:** Forms use `react-hook-form` paired with `@hookform/resolvers/zod` for client-side validation schemas matching backend DTO rules.
- **Server State:** Handled exclusively via TanStack Query (`useQuery`, `useMutation`), avoiding manual `useEffect` data-fetching loops.

---

*Convention analysis: 2026-11-12*
*Update when patterns change*
