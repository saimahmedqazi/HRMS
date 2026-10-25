# Roadmap: ZenHR Multi-Tenant SaaS HRMS

## Overview

ZenHR is delivered through a 7-phase vertical MVP progression designed to achieve full production readiness by 10 November 2026. Each phase produces working, end-to-end capabilities across both frontend and backend layers: from core multi-tenancy and two-layer RBAC, through organizational hierarchies, real-time attendance and work timer break tracking, configurable approval chains and probation-gated leave management, payroll and bulk processing, Stripe subscriptions and Gemini AI assistance, culminating in role-scoped dashboards and verified multi-cloud production deployment.

## Phases

- [x] **Phase 1: Multi-Tenant Core & Two-Layer RBAC Engine** - Full-stack foundation, Prisma multi-tenant isolation, JWT cookie auth, 7 roles, and 5 data scopes
- [x] **Phase 2: Organization Hierarchy, Employee Management & Cloud Storage** - Departments, designations, employee directory, status badges, and Cloudinary/S3 uploads
- [ ] **Phase 3: Attendance, Work Timer & Real-Time Alert Engine** - Check-in/out, Work Timer with break notifications, overtime calculation, nightly absence cron, and IP whitelist
- [ ] **Phase 4: Configurable Approval Engine & Leave Management** - Shared reporting-line approval engine, 3-month probation gating, HR leave modal with prescription download, and Resource Requests
- [ ] **Phase 5: Payroll & Asynchronous Bulk Data Pipeline** - Salary structures, PDF payslips, Dept Manager payroll summary, and BullMQ Excel employee import
- [ ] **Phase 6: Subscriptions, Gemini AI Assistant & Security Hardening** - Basic vs Premium tiers, Stripe checkout widget, 3-day retry cron, 2-month lockout, and Gemini AI HR assistant
- [ ] **Phase 7: Role-Scoped Dashboards, Analytics & Production Deployment** - 7 customized dashboards, Recharts analytics, Vercel & Render production configs, and CI/CD

## Phase Details

### Phase 1: Multi-Tenant Core & Two-Layer RBAC Engine
**Goal**: Establish full-stack monorepo, PostgreSQL database with Prisma schema, tenant isolation middleware, JWT authentication in secure httpOnly cookies, 7 user roles, 5 data scopes, and Super Admin Support Mode.
**Mode:** mvp
**UI hint**: yes
**Depends on**: Nothing (first phase)
**Requirements**: TENANT-01, TENANT-02, TENANT-03, RBAC-01, RBAC-02, RBAC-03, RBAC-04, RBAC-05
**Success Criteria**:
  1. User can register a company and log in via secure httpOnly cookies with sessions persisting across browser refreshes.
  2. Queries from Company A return zero records belonging to Company B, enforced at the Prisma/service layer.
  3. Super Admin can view all registered companies and enter an audit-logged, time-limited Support Mode to inspect tenant data.
  4. Backend controller guards and frontend sidebar dynamically adapt to the user's role and data scope.
**Plans**: 3 plans

Plans:
- [x] 01-01: Full-stack monorepo scaffolding (Next.js App Router + NestJS API), PostgreSQL schema, Prisma client extension with multi-tenant isolation.
- [x] 01-02: Authentication system with JWT access/refresh tokens in httpOnly cookies, password hashing, and session management.
- [x] 01-03: Two-layer RBAC guards (7 roles, 5 data scopes) and Super Admin audit-logged Support Mode with frontend shell integration.

### Phase 2: Organization Hierarchy, Employee Management & Cloud Storage
**Goal**: Deliver company organizational structure (departments, designations, reporting lines), comprehensive employee directory, status badges (`Active`, `On probation`, `Suspended`, etc.), and Cloudinary/S3 file storage pipeline.
**Mode:** mvp
**UI hint**: yes
**Depends on**: Phase 1
**Requirements**: ORG-01, ORG-02, EMP-01, EMP-02, EMP-03, EMP-04, FILE-01
**Success Criteria**:
  1. Company Admin and HR Manager can create and manage departments, designations, and assign department managers.
  2. HR Manager can create, update, and list employee profiles with reporting lines (`reportingManagerId`) and emergency contacts.
  3. Status badges (`Active`, `On probation`, `Suspended`, `On leave`, `Resigned`, `Terminated`) render prominently with automated notification triggers.
  4. Employee documents upload directly to Cloudinary or AWS S3, persisting only secure HTTPS URLs in the database.
**Plans**: 3 plans

Plans:
- [x] 02-01: Departments, designations, and organizational reporting hierarchy backend services and management UI.
- [x] 02-02: Comprehensive Employee CRUD, profile management, and status badge system with in-app/email alerts.
- [x] 02-03: Multer file upload pipeline integrated with Cloudinary (free tier) and AWS S3 storing HTTPS URLs in PostgreSQL.

### Phase 3: Attendance, Work Timer & Real-Time Alert Engine
**Goal**: Implement check-in/out (Onsite immediate Present, authorized Remote, HR Exceptions Queue), Work Timer (Premium) with Socket.IO + email break alerts to Team Lead, Dept Manager, and CEO, overtime calculation, nightly BullMQ absence cron, and IP tracking/whitelist.
**Mode:** mvp
**UI hint**: yes
**Depends on**: Phase 2
**Requirements**: ATT-01, ATT-02, ATT-03, ATT-04, ATT-05, ATT-06, ATT-07, TIMER-01, TIMER-02, TIMER-03
**Success Criteria**:
  1. Employee can check in Onsite as Present, or Remote if possessing an active approved remote work permission.
  2. Unauthorized remote check-in marks employee Absent (pending review) and surfaces in HR's Exceptions Queue.
  3. Pausing the Work Timer dispatches immediate real-time Socket.IO and email alerts to Team Lead, Department Manager, and Company Admin (CEO).
  4. Overtime minutes are automatically calculated and recorded once scheduled break and shift window concludes.
  5. Nightly BullMQ cron job marks employees Absent at end-of-day if no check-in, approved leave, or remote permission exists.
  6. Login captures client IP and approximate coordinates, displaying "You logged in from [place] at [time]" on profile, with HR IP Whitelist support.
**Plans**: 4 plans

Plans:
- [ ] 03-01: Attendance check-in/out engine (Onsite, Remote validation, and HR Exceptions Queue) with optional consent-gated location capture.
- [ ] 03-02: Socket.IO WebSocket gateway, client integration, and Nodemailer email notification dispatcher.
- [ ] 03-03: Work Timer module gated behind Premium plan, break pause alert dispatch, and automatic overtime calculation.
- [ ] 03-04: Nightly BullMQ absence cron worker and login IP tracking with HR IP Whitelist management.

### Phase 4: Configurable Approval Engine & Leave Management
**Goal**: Build generic reporting-line approval engine, 3-month probation gating on Employee role anchored to `hireDate`, Casual/Sick/Annual leave workflows with mandatory toggle, HR leave modal with prescription download, and Resource Request workflow.
**Mode:** mvp
**UI hint**: yes
**Depends on**: Phase 3
**Requirements**: LEAVE-01, LEAVE-02, LEAVE-03, LEAVE-04, LEAVE-05, LEAVE-06, APPR-01, APPR-02, RES-01
**Success Criteria**:
  1. Generic approval engine resolves approvers dynamically from requester's reporting line with step audit trail and auto-skipping.
  2. 3-month probation blocks leave submission exclusively for Employee role from `hireDate`, displaying probation end date banner.
  3. Leave requests route dynamically: `Employee -> Team Lead -> HR Manager (Final)` and `Team Lead -> Dept Manager -> HR Manager (Final)`.
  4. HR Manager can open leave detail modal displaying written reason and direct download link for uploaded medical prescription.
  5. Resource Requests progress from Employee -> Team Lead -> Dept Manager -> Fulfilling Department.
**Plans**: 3 plans

Plans:
- [ ] 04-01: Generic configurable approval routing engine supporting dynamic multi-step resolution and audit logging.
- [ ] 04-02: Leave management module (Casual, Sick with prescription upload, Annual) with probation gating, Admin/HR toggles, and balance deduction.
- [ ] 04-03: HR Leave modal with prescription download, standing Remote Work permission workflow, and Resource Request module.

### Phase 5: Payroll & Asynchronous Bulk Data Pipeline
**Goal**: Implement salary structures, allowances, deductions, tax calculation, monthly payroll execution, single and bulk PDF payslips, limited read-only department payroll summary for Department Managers, and asynchronous BullMQ Excel employee import pipeline.
**Mode:** mvp
**UI hint**: yes
**Depends on**: Phase 4
**Requirements**: PAY-01, PAY-02, PAY-03, PAY-04, BULK-01, BULK-02, BULK-03
**Success Criteria**:
  1. HR Manager can configure salary components and execute monthly payroll runs.
  2. Single and bulk PDF payslips can be generated, downloaded, and emailed to employees.
  3. Department Manager can view own payslip and a limited read-only department payroll summary, while team payroll is hidden from Team Leads.
  4. HR Manager can upload an Excel file of employees, preview validation errors, and process imports asynchronously via BullMQ worker.
**Plans**: 3 plans

Plans:
- [ ] 05-01: Salary structures, allowances, deductions, tax calculations, and monthly payroll execution engine.
- [ ] 05-02: Single and bulk PDF payslip generator and role-scoped payslip viewer (including Dept Manager summary).
- [ ] 05-03: Excel bulk employee import worker (BullMQ) with validation preview and downloadable error reports.

### Phase 6: Subscriptions, Gemini AI Assistant & Security Hardening
**Goal**: Enforce two-tier subscription gating (Basic vs Premium), Stripe prebuilt payment widget, BullMQ 3-day retry cron (Day +1, +2, +3), 2-month non-payment lockout, Google Gemini AI assistant with HR guardrails, and audit logging.
**Mode:** mvp
**UI hint**: yes
**Depends on**: Phase 5
**Requirements**: BILL-01, BILL-02, BILL-03, BILL-04, FILE-02, AI-01, AI-02, AI-03, SEC-01, SEC-02
**Success Criteria**:
  1. Platform enforces Basic (Work Timer, general uploads, AI OFF; Sick prescription ON) vs Premium (all ON) feature guards.
  2. Users can subscribe and manage payment methods using Stripe's prebuilt checkout widget.
  3. Scheduled BullMQ cron attempts payment renewal, retrying failed payments on Day +1, +2, +3 and logging exact error messages.
  4. 2 consecutive months of non-payment transitions tenant to Suspended (Non-Payment) and locks tenant access.
  5. Google Gemini AI HR assistant answers employee/admin questions with strict HR guardrails and page-link references.
**Plans**: 3 plans

Plans:
- [ ] 06-01: Two-tier subscription gating and Stripe prebuilt widget integration on frontend and backend.
- [ ] 06-02: BullMQ Stripe 3-day retry cron worker, failure alert system, and 2-month non-payment suspension lockout.
- [ ] 06-03: Google Gemini API integration with HR system prompts, context injection, topic classifier guardrails, and security audit log.

### Phase 7: Role-Scoped Dashboards, Analytics & Production Deployment
**Goal**: Build 7 role-scoped dashboards, Recharts analytics modules, production deployment configurations for Vercel (frontend) and Render (backend API, PostgreSQL, Redis), complete `.env.example` templates, and CI/CD pipelines ahead of 10 November 2026.
**Mode:** mvp
**UI hint**: yes
**Depends on**: Phase 6
**Requirements**: DASH-01, DASH-02, OPS-01, OPS-02, OPS-03
**Success Criteria**:
  1. Each of the 7 roles accesses a customized, scope-filtered dashboard (e.g. Super Admin platform health, Company Admin presence graph, HR queues).
  2. Recharts visualizations provide interactive trends for attendance, payroll, hiring, and subscriptions.
  3. Production build succeeds cleanly across frontend (Vercel) and backend (Render) workspaces with zero TypeScript errors (`tsc --noEmit`).
  4. GitHub Actions CI/CD workflows and complete `.env.example` templates are verified for production deployment.
**Plans**: 3 plans

Plans:
- [ ] 07-01: 7 role-scoped dashboard views and action queues (HR Exceptions Queue, Remote Work Queue, Approvals).
- [ ] 07-02: Interactive Recharts analytics module covering attendance, payroll, hiring, and revenue metrics.
- [ ] 07-03: Production deployment configurations (Docker, Render, Vercel), `.env.example` verification, and CI/CD pipelines.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Multi-Tenant Core & Two-Layer RBAC Engine | 0/3 | Not started | - |
| 2. Organization Hierarchy, Employee Management & Cloud Storage | 0/3 | Not started | - |
| 3. Attendance, Work Timer & Real-Time Alert Engine | 0/4 | Not started | - |
| 4. Configurable Approval Engine & Leave Management | 0/3 | Not started | - |
| 5. Payroll & Asynchronous Bulk Data Pipeline | 0/3 | Not started | - |
| 6. Subscriptions, Gemini AI Assistant & Security Hardening | 0/3 | Not started | - |
| 7. Role-Scoped Dashboards, Analytics & Production Deployment | 0/3 | Not started | - |
