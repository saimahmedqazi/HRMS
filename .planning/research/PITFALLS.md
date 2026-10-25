# Critical Pitfalls & Mitigation Strategies

**Domain:** Multi-Tenant SaaS HRMS
**Researched:** 2026-10-26
**Confidence:** HIGH

## Critical Pitfalls

### 1. Cross-Tenant Data Leakage via Unscoped Queries
- **The Risk**: A developer writes a Prisma query like `prisma.employee.findMany()` omitting `where: { companyId }`, allowing users from Company A to view records of Company B.
- **Warning Signs**: Lack of query middleware; manual filtering in controller code instead of service/ORM layer; lack of multi-tenant integration tests.
- **Prevention Strategy**:
  - Implement a Prisma Client extension / middleware that automatically injects `companyId` into all queries on tenant-owned models.
  - Create integration test suites verifying that Company A tokens return 404/empty arrays for Company B IDs.
- **Phase Mapping**: Phase 1 (Foundation & RBAC).

### 2. Vercel Serverless Function Timeouts on Background Jobs & WebSockets
- **The Risk**: Deploying NestJS backend to Vercel serverless functions causes HTTP 504 gateway timeouts when processing large Excel imports, Stripe retry loops, or maintaining Socket.IO connections.
- **Warning Signs**: Dropped WebSocket connections; truncated file imports; aborted cron executions.
- **Prevention Strategy**:
  - Deploy Backend API to Render as a persistent long-running container service.
  - Offload heavy tasks (Excel import, PDF payslip generation, emails) to BullMQ background workers backed by Redis.
- **Phase Mapping**: Phase 1 (Architecture & Environment) & Phase 7 (Deployment).

### 3. Client-Side Data Scope Bypasses
- **The Risk**: Hiding UI elements based on roles without enforcing row-level scope on backend endpoints, allowing a Department Manager to view other departments by modifying the URL or API payload.
- **Warning Signs**: Endpoints returning raw un-scoped lists; permission checks only present in frontend components.
- **Prevention Strategy**:
  - NestJS `DataScopeInterceptor` and custom query helper verifying caller's role against target entity's department/team.
  - Enforce at query time: if `user.role === 'DEPARTMENT_MANAGER'`, query automatically filters by `departmentId: user.departmentId`.
- **Phase Mapping**: Phase 1 & Phase 2.

### 4. Ephemeral Filesystem Data Loss in Production
- **The Risk**: Saving uploaded medical prescriptions or employee documents to a local `./uploads` directory on Render/Docker. When the container restarts or redeploys, all uploaded files are permanently destroyed.
- **Warning Signs**: Files accessible in local development but returning 404 after production deploy.
- **Prevention Strategy**:
  - Configure Multer with Cloudinary (free tier) or AWS S3 SDK.
  - Save strictly the returned HTTPS CDN URL in PostgreSQL.
  - Disallow local filesystem storage in production configurations.
- **Phase Mapping**: Phase 2 (Employee Documents) & Phase 4 (Leave Prescriptions).

### 5. Flaky Attendance State via Runtime-Derived Absences
- **The Risk**: Calculating employee "Absence" on the fly during reports instead of recording deterministic daily attendance records, leading to performance bottlenecks and inconsistent reporting.
- **Warning Signs**: Slow monthly attendance reports; discrepancy between daily presence graphs and monthly records.
- **Prevention Strategy**:
  - Implement a scheduled nightly BullMQ cron job that scans all active employees and inserts an `Absent` record if no check-in, approved leave, or active remote permission is found (excluding weekends/company holidays).
- **Phase Mapping**: Phase 3 (Attendance & Timers).

### 6. Stripe Webhook Desynchronization & Retry Spams
- **The Risk**: Unhandled webhook events or failed retries leading to duplicate charges, unrecorded failures, or tenants remaining active without payment.
- **Warning Signs**: Customer charged multiple times; company remaining in active state despite payment failures.
- **Prevention Strategy**:
  - Idempotent Stripe webhook handlers checking event IDs before processing.
  - Scheduled 3-day retry job (Day +1, +2, +3) with exact error logging in DB.
  - Automated tenant suspension after 2 consecutive months of non-payment.
- **Phase Mapping**: Phase 6 (Billing & Subscriptions).
