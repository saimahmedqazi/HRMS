# Phase 1: Multi-Tenant Core & Two-Layer RBAC Engine - Context

**Gathered:** 2026-10-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish the production-quality full-stack monorepo foundation for ZenHR:
- npm workspaces monorepo with `apps/frontend` (Next.js App Router) and `apps/backend` (NestJS) packages.
- PostgreSQL 16 database schema via Prisma ORM with a Prisma Client extension auto-injecting `companyId` into all tenant-owned model queries.
- JWT access tokens (15-minute expiry) + rotating refresh tokens (7-day), both stored in secure httpOnly SameSite cookies.
- Optional TOTP 2FA with backup codes.
- 7 user roles and 5 data scopes enforced through NestJS `RolesGuard`, `DataScopeService`, and server-driven sidebar module manifest.
- Super Admin time-limited Support Mode implemented via a JWT claim `supportModeCompanyId` with audit logging.
- Global unified API response envelope `{ success, data, message, timestamp }` via NestJS interceptor.
- Swagger documentation at `/api/docs`.

</domain>

<decisions>
## Implementation Decisions

### Monorepo & Project Structure
- npm workspaces monorepo: `apps/frontend` (Next.js App Router) and `apps/backend` (NestJS).
- Feature-based NestJS modules per domain (`/auth`, `/companies`, `/employees`) from the start.
- Backend database: `apps/backend/prisma/schema.prisma` with a dedicated migrations folder.
- REST API prefix `/api/v1/` on all endpoints; Swagger UI at `/api/docs`.

### Authentication & Session Patterns
- JWT access and refresh tokens stored exclusively in httpOnly, secure, SameSite=lax cookies — no localStorage, no Authorization headers.
- Access token expiry: 15 minutes; Refresh token expiry: 7 days.
- Rotating refresh tokens: each refresh invalidates the previous token and issues a new one (prevents refresh token replay).
- Optional TOTP (Google Authenticator compatible) 2FA with backup codes; user-initiated, not mandatory.

### Multi-Tenant Isolation Strategy
- Prisma Client extension (middleware) automatically injects `companyId` from `AsyncLocalStorage` context into every query `where` clause for tenant-owned models.
- `companyId` extracted from the JWT payload at login time and stored in `AsyncLocalStorage` for the request lifecycle.
- `TENANT_MODELS` TypeScript set listing which Prisma models require tenant scoping — platform models (Company, SuperAdmin, etc.) bypass the extension.
- Super Admin Support Mode grants temporary access via time-limited `supportModeCompanyId` claim in JWT, with every access recorded to the audit log.

### RBAC Guard & Data Scope Implementation
- `@Roles(...roles)` decorator + `RolesGuard` checks `user.role` from JWT — uniform across all endpoints.
- `DataScopeService.applyScope(user, baseQuery)` helper returns a Prisma `where` fragment merged in each service method.
- Backend API endpoint returns `allowedModules[]` for the authenticated user — frontend renders sidebar exclusively based on this server-driven manifest.
- All responses wrapped in `{ success, data, message, timestamp }` via a global NestJS `ResponseInterceptor`.

### Agent's Discretion
- Precise Prisma schema column naming conventions and migration naming.
- Specific security header values in Helmet configuration.
- Rate limiting thresholds for auth endpoints.
- Account lockout attempt count (suggested: 5 failed attempts → 15-minute lockout).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- No existing codebase — greenfield monorepo initialization.

### Established Patterns
- This phase establishes the patterns all subsequent phases will follow.
- NestJS: Module → Controller → Service → Prisma Client architecture.
- All environment variables validated via `@nestjs/config` with Joi at boot time.

### Integration Points
- `apps/backend/prisma/schema.prisma` — central schema file all subsequent phases extend.
- `apps/backend/src/common/prisma/tenant-extension.ts` — Prisma Client extension all services import.
- `apps/frontend/src/app/` — Next.js App Router root all subsequent pages add routes to.
- `apps/frontend/src/lib/api.ts` — Axios/Fetch client interceptor that subsequent modules use for API calls.

</code_context>

<specifics>
## Specific Ideas

- The `DataScopeService.applyScope()` helper should handle all 5 scopes: `PLATFORM` (no restriction), `COMPANY` (companyId), `DEPARTMENT` (companyId + departmentId), `TEAM` (companyId + teamId), `SELF` (companyId + employeeId).
- The `TENANT_MODELS` set must be explicitly declared so new models added in future phases are opt-in for tenancy, preventing accidental platform model pollution.
- The API response envelope should include a `meta` field for pagination in list endpoints: `{ success, data, message, timestamp, meta?: { total, page, limit } }`.

</specifics>

<deferred>
## Deferred Ideas

- Google OAuth login — mentioned in original spec, currently listed as "open item" (Section 22 of ZenHR spec). Deferred to a future phase or post-MVP addition.
- Audit log browsable UI — audit log is written in Phase 1, but the browsable admin UI for it is deferred to the analytics phase.

</deferred>
