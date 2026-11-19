# Coding Conventions

**Analysis Date:** 2026-11-19

## Naming Patterns

**Files:**
- `kebab-case` for all TypeScript and React files across both workspaces:
  - Backend NestJS artifacts follow `<feature>.<role>.ts`: `employees.module.ts`, `employees.controller.ts`, `employees.service.ts`, `attendance.cron.ts`, `attendance.gateway.ts`, `jwt.strategy.ts`
  - Backend DTOs use verb-noun `kebab-case` under each module's `dto/` directory: `create-employee.dto.ts`, `update-status.dto.ts`, `approve-step.dto.ts`, `chat-request.dto.ts`
  - Backend unit tests are co-located alongside source files as `*.spec.ts` (e.g., `apps/backend/src/modules/resources/resources.service.spec.ts`, `apps/backend/src/modules/payroll/payroll.controller.platform-scope.spec.ts`)
  - Frontend Next.js routes use App Router conventions (`page.tsx`, `layout.tsx`, `middleware.ts`) in `kebab-case` folders under `apps/frontend/src/app/`
  - Frontend components and utilities use `kebab-case.tsx` / `kebab-case.ts` (e.g., `apps/frontend/src/components/auth/auth-experience-panel.tsx`, `apps/frontend/src/components/ui/status-badge.tsx`, `apps/frontend/src/lib/auth-context.tsx`)

**Functions:**
- `camelCase` for all functions, service methods, and controller handlers (`listEmployees`, `onboardEmployee`, `resolveEmployeeScope`, `apiRequest`)
- No special prefix for `async` functions
- React event handlers use `handle*` or `on*` (`handleSubmit`, `handle2faSubmit`, `onSubmit`, `onClose`)
- Predicate helpers use `is*` / `has*` / `can*` (`isTenantModel`, `isThirdPartyCompensationQuery`, `hasModuleAccess`, `canOnboard`)
- React components use `PascalCase` (`AuthExperiencePanel`, `Sidebar`, `StatusBadge`, `EmployeesPage`)

**Variables:**
- `camelCase` for local variables, state hooks, and class fields (`companyId`, `mobileMenuOpen`, `totpEncryptionKey`)
- `UPPER_SNAKE_CASE` for module-level constants and static registries (`ROLE_SCOPE_MAP`, `ROLE_MODULE_MAP`, `TENANT_MODELS`, `ALL_NAV_ITEMS`, `DEFAULT_GEMINI_MODEL`, `AUTOPLAY_INTERVAL_MS`, `API_PREFIX`)
- No underscore prefix for private members; backend classes use TypeScript `private` / `private readonly` modifiers

**Types:**
- `PascalCase` for interfaces and type aliases without an `I` prefix (`AuthenticatedUser`, `ApiResponse`, `PaginationMeta`, `DataScopeFilter`, `UserProfile`, `SidebarProps`)
- `PascalCase` with `Dto` suffix for request payload classes (`CreateEmployeeDto`, `UpdateLeaveTypeDto`, `SupportModeDto`)
- `PascalCase` for Prisma enums with `UPPER_SNAKE_CASE` members (`UserRole.COMPANY_ADMIN`, `DataScope.DEPARTMENT`, `EmployeeStatus.ON_PROBATION`, `AttendanceStatus.ABSENT`)

## Code Style

**Formatting:**
- Prettier 3.3.3 is installed in `apps/backend` (`npm run format --workspace=apps/backend` runs `prettier --write "src/**/*.ts" "test/**/*.ts"`); no `.prettierrc` config file is committed, so Prettier defaults apply
- Observed formatting across both workspaces: 2-space indentation, single quotes for strings, semicolons required, trailing commas in multiline objects/parameter lists, and LF line endings (a few files such as `e2e/role-session.ts` contain CRLF)
- Numeric separators are used for millisecond constants (`15_000`, `6_500`)

**Linting:**
- ESLint 9 flat config is used in both apps and executed via root `npm run lint` (`npm run lint --workspaces --if-present`):
  - Backend: `apps/backend/eslint.config.mjs` parses `**/*.ts` with `@typescript-eslint/parser` and enforces `no-debugger`, `no-dupe-else-if`, `no-unreachable`, `no-unsafe-finally`, and `@typescript-eslint/no-duplicate-enum-values`
  - Frontend: `apps/frontend/eslint.config.mjs` applies `@next/eslint-plugin-next` `core-web-vitals` rules plus `no-debugger`, `no-dupe-else-if`, `no-unreachable`, and `no-unsafe-finally`
- Both ESLint configs are intentionally minimal (correctness-focused rather than stylistic); type safety is enforced primarily through `tsc --noEmit`

**TypeScript Strictness:**
- Both `apps/backend/tsconfig.json` and `apps/frontend/tsconfig.json` enable `"strict": true`
- Backend additionally enables `noImplicitAny: true`, `strictNullChecks: true`, `noFallthroughCasesInSwitch: true`, `forceConsistentCasingInFileNames: true`, `emitDecoratorMetadata: true`, and `experimentalDecorators: true`
- Typechecking runs via root `npm run typecheck` (`tsc --noEmit` in both workspaces)
- Note on `any`: some older controllers (`apps/backend/src/modules/leave/leave.controller.ts`) type `@CurrentUser() user: any` and some frontend queries type `api.get<any[]>`. Prefer `AuthenticatedUser` on backend controllers and explicit response interfaces on frontend queries for new code.

## Import Organization

**Order:**
1. Side-effect imports when required (`import 'multer';` in controllers using `Express.Multer.File`)
2. External framework and third-party packages (`@nestjs/*`, `react`, `next/*`, `@tanstack/react-query`, `@prisma/client`, `lucide-react`)
3. Internal workspace imports (`@common/*` or relative `../../common/*` in backend; `@/lib/*`, `@/components/*` in frontend)
4. Local sibling/DTO imports (`./employees.service`, `./dto/create-employee.dto`)

**Grouping:**
- Imports are usually kept in a single contiguous block without blank lines between groups, ordered external-to-local
- `import type { ... }` is used selectively for Express `Response`, `NestExpressApplication`, Tailwind `Config`, and type-only frontend imports (`type UserProfile`)

**Path Aliases:**
- Backend (`apps/backend/tsconfig.json` and Jest `moduleNameMapper` in `apps/backend/package.json`):
  - `@common/*` -> `src/common/*` (used in 36 files; newer modules prefer `@common/*`, while 30 earlier files use relative `../../common/*`)
  - `@modules/*` -> `src/modules/*` (configured but currently unused)
- Frontend (`apps/frontend/tsconfig.json`):
  - `@/*` -> `./src/*` (used consistently across all pages and components)

## Error Handling

**Backend Patterns:**
- Throw built-in NestJS `HttpException` subclasses directly from services and controllers (`BadRequestException`, `UnauthorizedException`, `ForbiddenException`, `NotFoundException`, `ConflictException`, `ServiceUnavailableException`)
- A global `ValidationPipe` in `apps/backend/src/main.ts` enforces `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`, and `enableImplicitConversion: true` on all DTOs
- A global `GlobalExceptionFilter` (`apps/backend/src/common/filters/global-exception.filter.ts`) catches all exceptions, maps Prisma `PrismaClientKnownRequestError` codes (`P2002` -> 409 Conflict, `P2025` -> 404 Not Found, `P2003` -> 400 Bad Request), and serializes a uniform error envelope: `{ success: false, data: null, message, errors, timestamp, path }`
- A global `ResponseInterceptor` (`apps/backend/src/common/interceptors/response.interceptor.ts`) wraps all non-stream responses in `{ success: true, data, message, timestamp }` while passing `StreamableFile` and already-enveloped objects through untouched
- For optimistic concurrency or race conditions on Prisma `update`, use `rethrowMissingRecordAsConflict()` (`apps/backend/src/common/utils/prisma-conflict.ts`) to convert `P2025` into `409 Conflict`
- External provider calls (Gemini in `apps/backend/src/modules/ai-assistant/ai-assistant.service.ts`, Stripe, SMTP) wrap network calls in `try/catch`, enforce timeouts (`AbortSignal.timeout`), log warnings, and degrade cleanly

**Frontend Patterns:**
- All HTTP calls go through `api` / `apiRequest` in `apps/frontend/src/lib/api.ts`, which sends `credentials: 'include'`, deduplicates concurrent 401 token refreshes via `refreshInFlight` + `sessionVersion`, unwraps `{ data }` envelopes, and throws `ApiError(status, message, data)`
- Validation error arrays from NestJS `GlobalExceptionFilter` are flattened into readable semicolon-separated messages inside `apiRequest`
- No third-party toast library is installed; pages display inline error and status banners driven by local `useState` (`error`, `success`) or TanStack Query `isError` / `mutation.error`

## Logging

**Framework:**
- Backend runtime code uses NestJS `Logger` instantiated per class: `private readonly logger = new Logger(ClassName.name);` (used across 19 backend files)
- `GlobalExceptionFilter` logs only `status >= 500` errors with HTTP method, path, message, and stack trace
- `PrismaService` enables Prisma `error` and `warn` stdout logging plus `query` event emission

**Patterns:**
- Use `this.logger.log(...)` for lifecycle events (bootstrap, DB connect/disconnect, cron completion), `this.logger.warn(...)` for fallback/sandbox states (missing external API keys, Gemini timeouts), and `this.logger.error(...)` for unexpected server failures
- `console.log` / `console.error` in backend is restricted strictly to standalone CLI scripts under `apps/backend/src/scripts/` (`bootstrap-admin.ts`, `encrypt-totp.ts`, `revoke-legacy-import-sessions.ts`) and `apps/backend/prisma/seed.ts`
- Frontend avoids `console.log`; `console.error` appears only in 3 catch blocks (`apps/frontend/src/app/dashboard/employees/[id]/page.tsx`, `apps/frontend/src/components/layout/support-mode-banner.tsx`)

## Comments

**When to Comment:**
- Explain domain rules, authorization invariants, and security constraints (e.g., third-party compensation refusal rules in `ai-assistant.service.ts`, two-layer RBAC comments in `roles.guard.ts`, numbered step comments inside multi-step `$transaction` blocks in `auth.service.ts`)
- Section-header comments (`// 1. Create company`, `{/* Role-Adaptive Navigation Links */}`) are commonly used in longer services and JSX templates

**JSDoc/TSDoc:**
- Used for shared registries, core security helpers, and public service methods (`ROLE_SCOPE_MAP`, `ROLE_MODULE_MAP`, `TENANT_MODELS`, `DataScopeService.applyScope`, `ResourcesService` methods)
- `@param` / `@returns` tags are generally omitted in favor of concise prose descriptions and explicit TypeScript signatures

**TODO Comments:**
- Zero `TODO`, `FIXME`, or `HACK` comments exist in `apps/backend/src/` or `apps/frontend/src/`; track deferred work in `.planning/` artifacts instead of inline code comments

## Function Design

**Backend Controllers, Services, DTOs, and Prisma Queries:**
- Controllers stay thin: declare Swagger decorators (`@ApiTags`, `@ApiCookieAuth`, `@ApiOperation`), guard decorators (`@UseGuards(JwtAuthGuard, RolesGuard)`, `@Roles(...)`), and delegate immediately to services
- DTOs declare `class-validator` decorators (`@IsString`, `@IsNotEmpty`, `@IsEmail`, `@IsOptional`, `@IsIn`, `@Min`, `@MaxLength`) paired with `@ApiProperty` / `@ApiPropertyOptional`, using definite assignment assertions (`firstName!: string;`) for required properties
- Multi-tenant queries always enforce tenant boundaries explicitly in `where` clauses (`companyId`, `deletedAt: null`) and apply role scoping via `DataScopeService.applyScope()` or `DataScopeService.resolveEmployeeScope()` (`apps/backend/src/common/services/data-scope.service.ts`)
- Multi-record mutations use `this.prisma.$transaction(async (tx) => { ... })`
- Soft-deletable models filter `deletedAt: null` on reads and update `deletedAt: new Date()` instead of hard-deleting

**Frontend Components, Forms, and Queries:**
- Client components declare `'use client';` on line 1 (all interactive pages and layout components are client components)
- Server state uses TanStack Query (`useQuery`, `useMutation`, `useQueryClient`) with global defaults in `apps/frontend/src/lib/query-provider.tsx` (`staleTime: 60_000`, `retry: 1`, `refetchOnWindowFocus: false`)
- Tenant-sensitive query keys include `user?.id` and effective `companyId` (`user?.supportModeCompanyId ?? user?.companyId`) to prevent cross-account cache bleed (e.g., `['employees', user?.id, companyId, ...]`)
- Forms: `react-hook-form` + `zod` + `@hookform/resolvers/zod` are used on auth forms (`apps/frontend/src/app/login/page.tsx`, `apps/frontend/src/app/register/page.tsx`); dashboard pages under `apps/frontend/src/app/dashboard/` manage modal and filter forms with local React `useState` + `useMutation`
- Styling: Tailwind CSS 3.4 with `darkMode: 'class'` (`apps/frontend/tailwind.config.ts`) and `lucide-react` icons; custom utility-styled components live in `apps/frontend/src/components/` rather than a generated ShadCN primitive library (`apps/frontend/src/components/ui/` contains only `password-input.tsx` and `status-badge.tsx`)
- Accessibility: interactive panels, mobile navigation drawers (`<dialog>`), and buttons use semantic roles, `aria-label`, `aria-live`, `focus-visible:ring-*`, and `prefers-reduced-motion` handling (see `apps/frontend/src/components/auth/auth-experience-panel.tsx` and `apps/frontend/src/components/layout/sidebar.tsx`)

## Module Design

**Exports:**
- Named exports everywhere in backend (`export class EmployeesService`, `export function createTenantPrismaClient`) and in frontend shared modules/components (`export function Sidebar`, `export const StatusBadge`, `export const api`)
- Default exports are used exclusively for Next.js App Router `page.tsx` and `layout.tsx` entry points (and config files like `tailwind.config.ts`, `eslint.config.mjs`)

**Barrel Files:**
- Barrel `index.ts` / `index.tsx` files are not used anywhere in `apps/backend` or `apps/frontend`; always import directly from the concrete module path

**NestJS & Next.js Module Boundaries:**
- Backend organizes features into 15 self-contained NestJS modules under `apps/backend/src/modules/` (`ai-assistant`, `analytics`, `attendance`, `auth`, `bulk-import`, `companies`, `employees`, `leave`, `notifications`, `organization`, `payroll`, `resources`, `subscriptions`, `super-admin`, `work-timer`), with cross-cutting guards, filters, decorators, Prisma, mail, storage, and utilities under `apps/backend/src/common/`
- Frontend gates all dashboard pages centrally in `apps/frontend/src/app/dashboard/layout.tsx` against the server-driven `allowedModules` manifest (`/api/v1/auth/me/modules`) and `tenantRouteRoles` before rendering child routes

---

*Convention analysis: 2026-11-19*
*Update when patterns change*
