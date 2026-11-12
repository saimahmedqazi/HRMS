# Architecture

**Analysis Date:** 2026-11-12

## Pattern Overview

**Overall:** Modular Monolithic NestJS REST API paired with Next.js 15 App Router SPA, backed by PostgreSQL, Prisma ORM, Redis (BullMQ queues and Socket.IO real-time gateway), and Cloud Object Storage.

**Key Characteristics:**
- **Strict Multi-Tenant Isolation:** Zero cross-tenant leakage enforced at database boundary via Node.js `AsyncLocalStorage` (`RequestContextService`) and Prisma Client Extensions (`createTenantPrismaClient`).
- **Two-Layer Authorization Architecture:** Layer 1 enforces Route-level RBAC (`RolesGuard`) and Subscription Tier gating (`SubscriptionTierGuard`); Layer 2 enforces Service-level Data Scoping (`DataScopeService`) filtering queries by `PLATFORM`, `COMPANY`, `DEPARTMENT`, `TEAM`, or `SELF`.
- **Role-Adaptive Frontend Presentation:** Frontend navigation tree and module availability are dynamically driven by backend permission manifests (`ROLE_MODULE_MAP`).
- **Hybrid Real-Time and Asynchronous Queuing:** Socket.IO WebSocket gateway handles instant break overstay warnings, timer punches, and leave notifications; Redis-backed BullMQ and `@nestjs/schedule` crons manage bulk Excel imports and nightly absence reconciliation.

---

## Layers

### 1. Presentation & UI Layer
- **Purpose:** Deliver accessible, responsive, dark-mode-ready dashboards tailored across 7 distinct organizational roles.
- **Contains:** Next.js 15 App Router pages, React 18 client components, ShadCN UI widgets, Tailwind CSS styling, Recharts visualization, React Hook Form, and TanStack React Query hooks.
- **Location:** `apps/frontend/src/app/`, `apps/frontend/src/components/`, `apps/frontend/src/lib/`
- **Depends on:** REST API endpoints (`/api/v1/*`) and Socket.IO WebSocket connections.
- **Used by:** End-user browsers (Super Admin, Operation Manager, Company Admin, HR Manager, Department Manager, Team Lead, Employee).

### 2. Transport & Controller Layer
- **Purpose:** Accept HTTP requests and WebSocket events, validate payloads, enforce route security guards, and route traffic to domain services.
- **Contains:** NestJS Controllers decorated with `@Controller()`, `@UseGuards()`, `@Roles()`, `@RequireSubscriptionTier()`, and Swagger annotations; WebSocket Gateways (`@WebSocketGateway()`).
- **Location:** `apps/backend/src/modules/*/controllers/`, `apps/backend/src/modules/*/*.controller.ts`, `apps/backend/src/modules/work-timer/work-timer.gateway.ts`
- **Depends on:** Domain services, guards, decorators, DTO schemas.
- **Used by:** Next.js frontend client, Stripe webhooks, Socket.IO clients.

### 3. Middleware, Guards & Interceptor Layer
- **Purpose:** Cross-cutting request processing: tenant context binding, session validation, RBAC checks, input sanitization, standardized response formatting, and unhandled exception conversion.
- **Contains:** `RequestContextMiddleware`, `JwtAuthGuard`, `RolesGuard`, `SubscriptionTierGuard`, `ResponseInterceptor`, `GlobalExceptionFilter`, and custom NestJS decorators (`@CurrentUser()`, `@Public()`, `@Roles()`).
- **Location:** `apps/backend/src/common/guards/`, `apps/backend/src/common/interceptors/`, `apps/backend/src/common/filters/`, `apps/backend/src/common/request-context/`
- **Depends on:** `@nestjs/core`, `@nestjs/jwt`, `AsyncLocalStorage`, `appConfig`.
- **Used by:** NestJS HTTP runtime pipeline wrapping all controller requests.

### 4. Domain Service Layer
- **Purpose:** Enforce all core HR business rules, multi-step approval workflows, payroll calculations, timer validation, and data scope boundaries.
- **Contains:** Injectable NestJS services (`@Injectable()`), such as `EmployeesService`, `LeaveService`, `ApprovalEngineService`, `AttendanceService`, `PayrollService`, `AiAssistantService`, and `DataScopeService`.
- **Location:** `apps/backend/src/modules/*/services/`, `apps/backend/src/modules/*/*.service.ts`, `apps/backend/src/common/services/`
- **Depends on:** PrismaService, RequestContextService, StorageService, MailService, Bull queues, external APIs (Stripe, Google GenAI SDK).
- **Used by:** NestJS Controllers, Cron schedulers, and queue job processors.

### 5. Data Access & Persistence Layer
- **Purpose:** Maintain relational integrity, enforce tenant boundaries on all queries, handle soft-deletes, and execute atomic database transactions.
- **Contains:** Prisma Client extension (`createTenantPrismaClient`), Prisma schema, database migrations, and seed scripts.
- **Location:** `apps/backend/src/common/prisma/prisma.service.ts`, `apps/backend/src/common/prisma/tenant-extension.ts`, `apps/backend/prisma/schema.prisma`
- **Depends on:** PostgreSQL 16 database.
- **Used by:** Domain services across all backend modules.

### 6. Background Queue & Event Processing Layer
- **Purpose:** Handle high-latency, resilient, or periodic tasks decoupled from the synchronous HTTP request/response loop.
- **Contains:** BullMQ queues (`bulk-import`), scheduled crons (`SubscriptionCronService`, nightly absence worker in `AttendanceService`), and Nodemailer email dispatchers.
- **Location:** `apps/backend/src/modules/bulk-import/`, `apps/backend/src/modules/subscriptions/`, `apps/backend/src/common/mail/`
- **Depends on:** Redis 7 datastore, Nodemailer transport.
- **Used by:** `BulkImportService`, `SubscriptionsService`, `AttendanceService`.

---

## Data Flow

### 1. Authenticated HTTP Request Flow
1. **Client Request:** Browser issues `fetch` request via `apps/frontend/src/lib/api.ts` with `credentials: 'include'` containing `httpOnly` JWT cookies (`access_token`, `refresh_token`).
2. **Context Binding:** `apps/backend/src/common/request-context/request-context.middleware.ts` extracts claims from the JWT, initializing `AsyncLocalStorage` with `userId`, `role`, `companyId`, and `supportModeCompanyId`.
3. **Route Guards:**
   - `JwtAuthGuard` confirms valid JWT signature and expiration.
   - `RolesGuard` verifies the user's role satisfies `@Roles(...)` metadata.
   - `SubscriptionTierGuard` verifies the company's tier (e.g. `PREMIUM` required for AI Assistant, Analytics, and Work Timer).
4. **Validation:** `ValidationPipe` validates the incoming body against class-validator DTO constraints (rejecting unknown properties).
5. **Service & Data Scope:** The target controller delegates to a domain service (e.g. `EmployeesService`). The service calls `DataScopeService.applyScope(user, context)` to generate the Prisma `where` clause matching the user's role scope (`PLATFORM`, `COMPANY`, `DEPARTMENT`, `TEAM`, or `SELF`).
6. **Tenant Database Access:** `PrismaService` executes the query through `tenant-extension.ts`, which automatically injects the tenant `companyId` constraint into the SQL query.
7. **Response Transformation:** `ResponseInterceptor` formats the output into standard envelope: `{ success: true, data: ..., timestamp: ... }`.

### 2. Work Timer & Punch Event Flow
1. **Timer Action:** Employee clicks Check-in, Start Break, or Check-out in `apps/frontend/src/app/dashboard/work-timer/page.tsx`.
2. **API Execution:** Invokes `WorkTimerController.punch()` in `apps/backend/src/modules/work-timer/work-timer.controller.ts`.
3. **Geo & IP Metadata:** Request context captures IP and optional coordinates (stored as non-intrusive informational metadata).
4. **Attendance Calculation:** `WorkTimerService` computes elapsed minutes, verifies shift rules, and updates `AttendanceRecord` and `TimerBreak`.
5. **Real-time Broadcast:** `WorkTimerGateway` emits WebSocket events (`timer:update`, `break:overstay_alert`) to connected supervisors and team leads.

### 3. Leave Application & Multi-Step Approval Flow
1. **Submission:** Employee creates leave request with type, date range, reason, and optional medical certificate upload via `apps/frontend/src/app/dashboard/my-leave/page.tsx`.
2. **Document Staging:** If a PDF is attached, `StorageService` securely uploads to Cloudinary or falls back to an offline signed storage URL.
3. **Routing Engine:** `ApprovalEngineService` resolves required approval tiers based on company policy (e.g. Team Lead -> Department Manager -> HR Manager).
4. **Action & Notification:** Approvers review and approve/reject; `MailService` sends transactional email notification, and in-app `NotificationsService` updates the recipient's notification bell.

### 4. State Management
- **Client-Side:** Managed by `@tanstack/react-query` with declarative query keys (e.g. `['employees', filters]`), cached invalidations on mutation, and `AuthContext` (`apps/frontend/src/lib/auth-context.tsx`) holding authenticated session state.
- **Server-Side:** Ephemeral session data stored in `httpOnly` secure cookies; transactional state stored in PostgreSQL; transient job queues and pub/sub events managed in Redis.

---

## Key Abstractions

### RequestContextService & AsyncLocalStorage
- **Purpose:** Propagates tenant context (`companyId`, `userId`, `role`, `supportModeCompanyId`) seamlessly across asynchronous call stacks without manual argument drilling.
- **Location:** `apps/backend/src/common/request-context/request-context.service.ts`
- **Pattern:** Ambient Context / Thread-Local Storage using Node.js `AsyncLocalStorage`.

### DataScopeService
- **Purpose:** Enforces data visibility rules based on the 7 distinct system roles.
- **Location:** `apps/backend/src/common/services/data-scope.service.ts`
- **Pattern:** Policy Object / Query Specification Builder.

### Tenant Prisma Extension (`createTenantPrismaClient`)
- **Purpose:** Intercepts all Prisma query operations (`findMany`, `create`, `update`, `delete`, etc.) on `TENANT_MODELS` to ensure `companyId` is injected, preventing cross-tenant data leaks.
- **Location:** `apps/backend/src/common/prisma/tenant-extension.ts`
- **Pattern:** Decorator / Extension Middleware.

### ApprovalEngineService
- **Purpose:** Manages multi-tiered approval transitions across leave applications and company resource requests.
- **Location:** `apps/backend/src/modules/leave/approval-engine.service.ts`, `apps/backend/src/modules/resources/resources.service.ts`
- **Pattern:** Finite State Machine / Chain of Responsibility.

### StorageService
- **Purpose:** Cloud-agnostic file upload interface (Cloudinary API with signed URL fallback).
- **Location:** `apps/backend/src/common/storage/storage.service.ts`
- **Pattern:** Strategy / Adapter Pattern.

---

## Entry Points

### Backend REST API & WebSockets
- **File:** `apps/backend/src/main.ts`
- **Triggers:** Node process initialization via `npm run start:dev` or `node dist/src/main`.
- **Responsibilities:** Configures Helmet, CORS, Cookie Parser, global `ValidationPipe`, global `ResponseInterceptor`, global `GlobalExceptionFilter`, Swagger OpenAPI setup (`/api/docs`), and binds HTTP/WebSocket listeners on port 4000.

### Frontend Web Application
- **File:** `apps/frontend/src/app/layout.tsx` & `apps/frontend/src/app/page.tsx`
- **Triggers:** Next.js development server (`next dev`) or production server (`next start`).
- **Responsibilities:** Wraps application in `QueryProvider` and `AuthProvider`, checks session validity, and routes authenticated users to `/dashboard` or unauthenticated users to `/login`.

### Background Workers & Schedulers
- **Files:** `apps/backend/src/modules/subscriptions/subscription-cron.service.ts`, `apps/backend/src/modules/bulk-import/bulk-import.processor.ts`
- **Triggers:** `@nestjs/schedule` cron triggers (`@Cron('0 2 * * *')`) and Bull queue events.
- **Responsibilities:** Execute Stripe retry checks, mark unexcused absences at midnight, and parse bulk Excel employee imports.

---

## Error Handling

**Strategy:** Fail-fast centralized exception processing. Domain services throw standard NestJS HTTP exceptions (`BadRequestException`, `UnauthorizedException`, `ForbiddenException`, `NotFoundException`, `ConflictException`), which bubble up to the global filter.

**Key Components:**
- **GlobalExceptionFilter:** (`apps/backend/src/common/filters/global-exception.filter.ts`) Catches all unhandled exceptions and Prisma errors (e.g. `P2002` unique constraint violation, `P2025` record not found) and maps them to clean JSON responses:
  ```json
  {
    "success": false,
    "statusCode": 400,
    "message": "Human-readable error explanation",
    "error": "Bad Request",
    "timestamp": "2026-11-12T00:00:00.000Z",
    "path": "/api/v1/employees"
  }
  ```
- **Client Error Normalization:** (`apps/frontend/src/lib/api.ts`) Standardizes network errors and displays actionable toast alerts via `react-hot-toast` / ShadCN UI.

---

## Cross-Cutting Concerns

**Authentication & Session Management:**
- Authentication uses dual-token JWT architecture.
- Tokens stored in secure, `httpOnly`, `SameSite=Lax` cookies to prevent XSS theft.
- Support Mode enables Super Admins to assume company context (`supportModeCompanyId`) with a distinct amber banner and full audit trail logging.

**Tenant Isolation:**
- All tenant models carry `companyId` foreign key and composite indices (`[companyId, id]`).
- Prisma Client extension guarantees automatic WHERE clause injection.
- Zero client-side tenant filtering: unauthorized rows are never transmitted over the wire.

**Audit Logging:**
- `AuditLogService` (`apps/backend/src/common/services/audit-log.service.ts`) records administrative mutations, support mode activations, role modifications, and payroll releases into `AuditLog` table.

---

*Architecture analysis: 2026-11-12*
*Update when major patterns change*
