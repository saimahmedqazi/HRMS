# Codebase Concerns

**Analysis Date:** 2026-11-12

## Tech Debt

**Cloudinary and External Storage Fallback:**
- **Issue:** When `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, or `CLOUDINARY_API_SECRET` are not provisioned in local development or CI environments, file uploads fall back to deterministic mock URLs (`https://res.cloudinary.com/zenhr/image/upload/...`).
- **Files:** `apps/backend/src/common/storage/storage.service.ts`, `apps/frontend/src/app/dashboard/employees/[id]/page.tsx`
- **Why:** Enables full end-to-end local testing without external internet dependencies or paid Cloudinary credentials.
- **Impact:** Mock URLs return 401 ACL denials if an external browser tries to fetch them directly from Cloudinary CDN without passing through the application proxy.
- **Fix approach:** In production, enforce mandatory Cloudinary or AWS S3 credentials via `app.config.ts` validation and serve document previews via an authenticated backend stream proxy (`/api/v1/employees/documents/:id/download`).

**Local Single-Instance WebSocket Gateway:**
- **Issue:** Socket.IO gateway uses the default in-memory adapter for local development rather than Redis Streams.
- **Files:** `apps/backend/src/modules/work-timer/work-timer.gateway.ts`
- **Why:** Simplifies zero-dependency developer onboarding.
- **Impact:** Horizontal scaling across multiple backend container instances will not broadcast timer punch events to sockets connected to different nodes.
- **Fix approach:** Configure `@socket.io/redis-adapter` backed by the existing Redis cluster when running in multi-instance production environments.

---

## Known Bugs & Regressions (UAT Resolution Audit)

The following 12 defects were identified during Team Lead UAT and project testing, subsequently resolved, and verified. They represent critical regression risks that require automated test vigilance:

**D-01: Managerial Profile Sub-Resource Scoping:**
- **Symptoms:** Team Lead and Department Managers could add Contact/Document records to their own profile, but submissions on team members' profiles failed silently.
- **Files:** `apps/backend/src/modules/employees/employees.service.ts`, `apps/frontend/src/app/dashboard/employees/[id]/page.tsx`
- **Root Cause:** Backend service strictly matched `userId === currentUser.id` instead of allowing managerial roles with valid department or team data scopes to create sub-records.
- **Prevention:** Guarded by `employees.service.spec.ts` testing sub-resource insertion under `TEAM_LEAD` and `DEPT_HEAD` roles.

**D-02: Dashboard Headcount Aggregation Mismatch:**
- **Symptoms:** Dashboard summary showed 0 checked-in while Attendance list displayed 4 Present employees.
- **Files:** `apps/backend/src/modules/attendance/attendance.service.ts`, `apps/frontend/src/app/dashboard/page.tsx`
- **Root Cause:** Aggregation query filtered by strict UTC calendar boundary rather than the tenant's configured shift date range.
- **Prevention:** Standardized date boundary queries across dashboard metrics and attendance tables.

**D-03: Work Timer Duration Unit Mismatch & Absent Status:**
- **Symptoms:** Attendance list view showed 2m while detail view showed 38m; checked-in employee remained marked as `ABSENT_PENDING_REVIEW`.
- **Files:** `apps/backend/src/modules/attendance/attendance.service.ts`, `apps/backend/src/modules/work-timer/work-timer.service.ts`
- **Root Cause:** List view displayed elapsed pause duration instead of total worked duration, and check-in punch failed to transition attendance status to `PRESENT`.
- **Prevention:** Fixed status state machine transition on first punch of shift in `work-timer.service.ts`.

**D-04 & D-05: Resource Request Two-Step Approval Matrix:**
- **Symptoms:** ACTION column showed "-" for Team Leads on pending requests; HR and CEO had no Reject option at Step 2.
- **Files:** `apps/backend/src/modules/resources/resources.service.ts`, `apps/frontend/src/app/dashboard/resources/page.tsx`
- **Root Cause:** Approval matrix allowed Step 1 endorsements but lacked role-scoped action button mapping for Step 1 approvers, and lacked a rejection pathway at Step 2 fulfillment.
- **Prevention:** Explicit action guards in `resources.service.ts` enforcing Step 1 (Approve/Reject) and Step 2 (Fulfil/Reject).

**D-06: Cross-Tenant Resource Request Visibility:**
- **Symptoms:** Operation Manager could see resource requisitions belonging to employees of other tenant companies.
- **Files:** `apps/backend/src/common/services/data-scope.service.ts`, `apps/backend/src/modules/resources/resources.service.ts`
- **Root Cause:** Operation Manager was assigned `PLATFORM` scope without tenant filtering on company-specific asset requisitions.
- **Prevention:** Restricted tenant resource requests strictly to the user's active tenant scope unless Super Admin active Support Mode is enabled.

---

## Security Considerations

**Tenant Isolation Integrity:**
- **Risk:** Unintentional data leakage across tenant boundaries if developers use raw SQL queries or bypass Prisma Client extensions.
- **Files:** `apps/backend/src/common/prisma/tenant-extension.ts`, `apps/backend/src/common/services/data-scope.service.ts`
- **Current Mitigation:** Mandatory `companyId` injection at Prisma query level via `createTenantPrismaClient` and strict two-layer authorization (`RolesGuard` + `DataScopeService`).
- **Recommendations:** Strictly ban `$queryRaw` in PR code reviews; run automated multi-tenant isolation unit tests (`tenant-extension.spec.ts`) in CI.

**Support Mode Impersonation Abuse:**
- **Risk:** Super Admin impersonating a tenant company to access sensitive payroll, compensation, or personal employee data.
- **Files:** `apps/backend/src/modules/super-admin/super-admin.service.ts`, `apps/frontend/src/components/layout/support-mode-banner.tsx`
- **Current Mitigation:** Every Support Mode activation requires a mandatory audit log entry, sets a clear session flag, and displays a prominent persistent amber banner on the frontend.
- **Recommendations:** Enforce session timeout (maximum 30 minutes) on active Support Mode tokens with automatic de-authentication.

**Authentication & Cookie Security:**
- **Risk:** Cross-site scripting (XSS) or cross-site request forgery (CSRF) token theft.
- **Current Mitigation:** JWT tokens stored in `httpOnly`, `SameSite=Lax`, and `Secure` cookies; CORS strictly locked to frontend origin; Helmet security headers active.

---

## Performance Bottlenecks

**Bulk Workforce Excel Ingestion:**
- **Problem:** Processing Excel workbooks containing thousands of rows with complex relationships (departments, teams, payroll structures).
- **Files:** `apps/backend/src/modules/bulk-import/bulk-import.service.ts`, `bulk-import.processor.ts`
- **Measurement:** Ingesting 5,000 employees synchronously blocks the Node.js event loop for > 8 seconds.
- **Current Mitigation:** Offloaded to BullMQ background queue running in Redis with batch inserts (chunks of 100 rows).
- **Improvement Path:** Implement client-side chunk pre-validation and worker parallelism using BullMQ worker concurrency settings.

**Attendance & Headcount Dashboard Aggregation:**
- **Problem:** Aggregating active punches, break minutes, and absence exceptions across large enterprise tenants.
- **Files:** `apps/backend/src/modules/analytics/analytics.service.ts`, `apps/backend/src/modules/attendance/attendance.service.ts`
- **Measurement:** ~250ms query latency on unindexed attendance tables with 100k+ rows.
- **Current Mitigation:** Composite indexing on `[companyId, date, status]` in `schema.prisma`.
- **Improvement Path:** Introduce 5-minute Redis caching for top-level dashboard headcount statistics.

---

## Fragile Areas

**Multi-Tier Leave Approval Engine:**
- **File:** `apps/backend/src/modules/leave/approval-engine.service.ts`
- **Why Fragile:** Multi-tiered decision matrix depends on hierarchical reporting lines (Direct Manager -> Department Head -> HR Manager). Circular reporting relationships or missing department heads can stall workflows in indeterminate states.
- **Safe Modification:** Always test edge cases with orphaned employees, self-approvals, and cross-department transfers using `approval-engine.service.spec.ts`.

**Real-Time Punch State Machine:**
- **File:** `apps/backend/src/modules/work-timer/work-timer.service.ts`
- **Why Fragile:** Punch transitions (`CHECK_IN` -> `BREAK_START` -> `BREAK_END` -> `CHECK_OUT`) require strict state continuity. Network jitter or double-clicks can generate concurrent conflicting requests.
- **Safe Modification:** Protected by database transaction locking and unique active session constraints.

---

## Scaling Limits

**Backend Deployment Architecture (Render vs Serverless):**
- **Current Capacity:** Single Render persistent container process handling ~500 concurrent WebSocket connections.
- **Limit:** Vercel or AWS Lambda serverless functions are strictly incompatible with ZenHR backend due to hard execution timeouts (10-15s), lack of persistent WebSocket state, and termination of background cron jobs.
- **Scaling Path:** Deploy backend as a containerized persistent service (Render, AWS ECS, or Google Cloud Run with persistent WebSockets enabled) paired with a managed Redis cluster for BullMQ queues.

---

## Dependencies at Risk

**xlsx (SheetJS):**
- **Risk:** Known security advisories regarding prototype pollution on unmaintained open-source versions.
- **Impact:** High vulnerability during user-uploaded Excel file parsing in bulk import.
- **Migration Plan:** Validate file streams before parsing; restrict allowed workbook schemas; migrate to `exceljs` for long-term active maintenance.

---

## Missing Critical Features (Post-Launch Backlog)

**Automated Tax Filing & Direct Deposit Integration:**
- **Problem:** Payroll module generates PDF payslips and CSV bank transfer batches, but lacks direct automated clearing house (ACH) integration.
- **Workaround:** HR managers download generated CSV disbursements and manually upload them to company banking portals.
- **Implementation Complexity:** High (requires Plaid / Stripe Financial Connections integration).

---

## Test Coverage Gaps

**Concurrent WebSocket Punch Load Testing:**
- **Untested Area:** Simultaneous punch events from 1,000+ employees at 9:00 AM shift start.
- **Risk:** WebSocket connection saturation or database connection pool exhaustion.
- **Priority:** Medium.
- **Difficulty to Test:** Requires distributed load testing harness (e.g. k6 or Artillery with Socket.IO plugin).

---

*Concerns audit: 2026-11-12*
*Update as issues are fixed or new ones discovered*
