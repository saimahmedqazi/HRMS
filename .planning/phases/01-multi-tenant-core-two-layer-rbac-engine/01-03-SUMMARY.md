# Summary 01-03: Two-Layer RBAC, Data Scope & Frontend Shell

**Phase:** 01 — Multi-Tenant Core & Two-Layer RBAC Engine  
**Status:** Completed  
**Completed Date:** 2026-10-26  

## Deliverables & Key Changes
1. **Prisma Tenant Extension**:
   - `createTenantPrismaClient` wrapping Prisma queries with automatic `companyId` injection for all models in `TENANT_MODELS`.
   - Explicit exclusion of platform models (`Company`, `User`, `AuditLog`, `SupportModeSession`) preventing leakage.
   - Comprehensive unit test in `tenant-extension.spec.ts`.
2. **Two-Layer Authorization**:
   - Layer 1 (`RolesGuard`): Validates `@Roles()` decorator against caller's JWT role. Tested in `roles.guard.spec.ts`.
   - Layer 2 (`DataScopeService`): Injects Prisma query where clauses matching the 5 scopes (`PLATFORM`, `COMPANY`, `DEPARTMENT`, `TEAM`, `SELF`). Tested in `data-scope.service.spec.ts`.
   - Server-driven modules manifest: `getAllowedModules(role)` drives navigation access.
3. **Super Admin Support Mode**:
   - Time-limited (1-hour default) Support Mode token with `supportModeCompanyId` claim.
   - Full audit logging into `AuditLog` with `AuditAction.STATUS_CHANGE`, `SUPPORT_MODE_ENTER`, and `SUPPORT_MODE_EXIT`.
   - Tested in `super-admin.service.spec.ts`.
4. **Next.js Frontend Shell**:
   - Auth pages: Login and Company Registration using React Hook Form + Zod.
   - Server-driven sidebar strictly rendering navigation matching `user.allowedModules`.
   - Responsive header with theme toggling and logout handler.
   - Role-scoped dashboard layout with user context.

## Verification
- Unit test suite:
  - `roles.guard.spec.ts` -> 5/5 passed
  - `data-scope.service.spec.ts` -> 6/6 passed
  - `tenant-extension.spec.ts` -> 2/2 passed
  - `super-admin.service.spec.ts` -> 6/6 passed
  - Total: 26/26 tests passed across 5 test suites.
- Typechecks:
  - Backend `tsc --noEmit`: 0 errors
  - Frontend `tsc --noEmit`: 0 errors
