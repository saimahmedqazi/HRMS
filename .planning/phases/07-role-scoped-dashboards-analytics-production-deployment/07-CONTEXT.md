# Phase 7 Context: Role-Scoped Dashboards, Analytics & Production Deployment

**Phase:** 07 — Role-Scoped Dashboards, Analytics & Production Deployment  
**Created:** 2026-10-26  
**Status:** In Progress  

## Key Architectural Decisions

1. **7 Distinct Role-Scoped Dashboard Experiences**:
   - `SUPER_ADMIN`: Platform-wide stats (total tenants, MRR, active vs suspended, support mode trigger).
   - `OPERATION_MANAGER`: Resource fulfillment pipeline, tenant status overview.
   - `COMPANY_ADMIN`: Executive dashboard (company headcount, attendance rates, payroll expenditure, billing status).
   - `HR_MANAGER`: HR command center (attendance exceptions counter, pending leaves, probationary employees list, quick payroll run).
   - `DEPARTMENT_MANAGER`: Department view (attendance today, team leave approvals, department payroll aggregate link).
   - `TEAM_LEAD`: Team squad view (live check-ins, active work timers, break overstay alerts, pending approvals).
   - `EMPLOYEE`: Personal workspace (today's punch widget, digital timer ticker, leave balances, recent payslip download).
2. **Recharts Data Visualizations**:
   - Monthly Attendance Trends Chart (AreaChart).
   - Department Headcount Distribution (BarChart / PieChart).
   - Monthly Payroll Outflow trend.
3. **Production Deployment & CI/CD**:
   - Multi-stage Dockerfiles:
     - `apps/backend/Dockerfile`
     - `apps/frontend/Dockerfile`
   - Render Deployment blueprint (`render.yaml`): PostgreSQL 16, Redis 7, Backend persistent service.
   - GitHub Actions CI/CD (`.github/workflows/ci.yml`): Lint, typecheck, and test runner across backend & frontend workspaces.
4. **End-to-End System Verification**:
   - Automated test suite execution across the entire monorepo.
   - Comprehensive milestone summary.
