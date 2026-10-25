# ZenHR Multi-Tenant SaaS HRMS

## What This Is

ZenHR is a production-ready, multi-tenant SaaS Human Resource Management System (HRMS). One unified platform serves multiple isolated client companies (tenants), each configured with its own subscription tier (Basic or Premium), organizational structure (departments, designations, teams), configurable approval workflows, and workforce records across 7 roles and 15 modules.

## Core Value

Rock-solid multi-tenant data isolation and role-scoped operational workflows (attendance, work timer, leave, payroll, billing, and AI assistant) delivering an enterprise-grade HRMS with zero cross-tenant data leakage.

## Business Context

- **Customer**: Small, medium, and growing enterprises requiring automated HR operations, attendance tracking, and payroll processing.
- **Revenue model**: Tiered multi-tenant subscriptions (Basic and Premium) billed via Stripe with automated BullMQ cron payment retries and suspension locks.
- **Success metric**: Fully verified and deployed production system on Vercel and Render ahead of the 10 November 2026 deadline satisfying all 10 supervisor priorities.
- **Strategy notes**: Consolidated from `ZenHR — Functional & Role-Based Requirements Specification (v2.1)` and supervisor mandate in `req.docx`.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] **TENANT-01**: Multi-tenant isolation enforcing `companyId` on all company-owned database tables with zero cross-tenant leakage.
- [ ] **RBAC-01**: Two-layer authorization enforcing 7 roles (`SUPER_ADMIN`, `OPERATION_MANAGER`, `COMPANY_ADMIN`, `HR_MANAGER`, `DEPARTMENT_MANAGER`, `TEAM_LEAD`, `EMPLOYEE`) and 5 data scopes (`PLATFORM`, `COMPANY`, `DEPARTMENT`, `TEAM`, `SELF`) at the service/query layer.
- [ ] **RBAC-02**: Restricted `SUPER_ADMIN` support mode (time-limited, reason-logged, audit-tracked) preventing unrestricted operational data inspection.
- [ ] **RBAC-03**: Company Admin restricted to top-of-chain approvals only (HR Manager requests and Dept Manager fallbacks), keeping routine leave/attendance approvals with direct managers and HR.
- [ ] **ATT-01**: Check-in / check-out with Onsite immediate mark, authorized standing Remote Work check-in, and unauthorized check-in routed to HR Exceptions Queue.
- [ ] **ATT-02**: Automated nightly BullMQ cron job marking employees Absent if no check-in, approved leave, or remote permission exists by end of day.
- [ ] **ATT-03**: Optional, consent-withdrawable check-in location capture strictly recorded as informational metadata (no mandatory GPS blocking).
- [ ] **ATT-04**: Login IP capture and coarse geolocation displaying "You logged in from [place] at [time]" on profile, plus HR IP Whitelist for hybrid/remote staff.
- [ ] **TIMER-01**: Work Timer gated behind Premium subscription plan with start, pause, and stop controls.
- [ ] **TIMER-02**: Real-time Socket.IO and email break notifications sent to Team Lead, Department Manager, and Company Admin (CEO) when timer is paused.
- [ ] **TIMER-03**: Automatic overtime calculation and recording on daily attendance once scheduled shift/break window ends.
- [ ] **LEAVE-01**: Three leave types: Casual (reason required), Sick (medical prescription upload required), Annual (reason required), with Admin/HR mandatory toggle.
- [ ] **LEAVE-02**: 3-month probation gating exclusively for `EMPLOYEE` role anchored to `hireDate`, displaying probation end date banner and allocating balances upon completion.
- [ ] **LEAVE-03**: Configurable approval routing chain: `Employee -> Team Lead -> HR Manager (Final)` and `Team Lead -> Department Manager -> HR Manager (Final)`.
- [ ] **LEAVE-04**: HR Leave List and detail modal displaying reason and direct download link for uploaded medical prescription.
- [ ] **APPR-01**: Shared configurable approval engine for Leave, Remote Work, and Resource Requests with dynamic reporting-line resolution and step audit trail.
- [ ] **RES-01**: Resource Request workflow through Team Lead (Step 1) -> Department Manager (Step 2) -> Fulfilling Department (Step 3).
- [ ] **PAY-01**: Payroll management with salary structures, allowances, deductions, tax calculation, and single/bulk PDF payslip generation.
- [ ] **PAY-02**: Limited read-only department payroll summary view for Department Managers while hiding team payroll from Team Leads.
- [ ] **BULK-01**: Excel bulk employee import pipeline with validation preview, asynchronous BullMQ processing, and downloadable error report.
- [ ] **BILL-01**: Two subscription tiers: `BASIC` (Core HR on; Work Timer, file uploads, AI off; Sick prescription upload on) and `PREMIUM` (all on).
- [ ] **BILL-02**: Integrated Stripe prebuilt payment widget for frontend checkout and card management.
- [ ] **BILL-03**: Scheduled BullMQ cron retrying failed subscription payments on Day +1, Day +2, and Day +3, logging exact Stripe error and alerting subscriber.
- [ ] **BILL-04**: Tenant lockout (`Suspended (Non-Payment)`) after 2 consecutive months of failed payments, blocking tenant sessions until resolved.
- [ ] **FILE-01**: Multer upload middleware uploading files (documents, medical prescriptions) to Cloudinary or AWS S3 and persisting only URLs in PostgreSQL.
- [ ] **AI-01**: Google Gemini API integration scoped strictly to HR/company questions for Admin, HR, Managers, and newly onboarded Employees.
- [ ] **BADGE-01**: Employee status badges (`Active`, `On probation`, `Suspended`, `On leave`, `Resigned`, `Terminated`) with email/in-app alerts on status change.
- [ ] **DASH-01**: 7 customized role-scoped dashboards and Recharts analytics modules filtered strictly by data scope.
- [ ] **OPS-01**: Production deployment configuration for Vercel (frontend) and Render (backend API, PostgreSQL, Redis) with complete `.env.example` templates.

### Out of Scope

- **10-Minute Screenshot Snapshots**: Rejected due to employee privacy concerns, OS background permission bugs, and excessive storage overhead.
- **Covid-based Tracking Concepts**: Replaced by the Work Timer and shift schedules.
- **Deep CTO/CEO Leave Hierarchy**: CEO-level leave is recorded directly by HR or the CEO without multi-step chains.
- **Custom AI Model Training / Fine-Tuning**: Using Google Gemini API with system prompts, context injection, and topic guardrails out-of-the-box.
- **Biometric / Face Verification Check-In**: Strictly forbidden; check-in location is opt-in informational metadata only.
- **Mobile Native Apps (iOS/Android)**: Responsive web application built with Next.js is prioritized for v1.

## Context

- Specification is locked in `ZenHR — Functional & Role-Based Requirements Specification (v2.1)` and supervisor directive in `req.docx`.
- Platform is prepared for Final Year Project defense and live commercial deployment by 10 November 2026.
- Architecture must prevent serverless timeouts: backend runs on a persistent service (Render) rather than Vercel serverless functions to accommodate BullMQ background jobs, WebSocket connections, and Stripe cron jobs.

## Constraints

- **Timeline**: Hard production deadline of 10 November 2026.
- **Frontend Stack**: Next.js (App Router), React, TypeScript (`strict: true`), Tailwind CSS, ShadCN UI, TanStack Query, React Hook Form, Zod, Recharts.
- **Backend Stack**: Node.js, NestJS, PostgreSQL, Prisma ORM, JWT + Refresh tokens in `httpOnly` secure cookies, Socket.IO, Nodemailer, BullMQ, Redis.
- **Storage**: Cloudinary (free tier) or AWS S3; strictly URLs stored in PostgreSQL.
- **Deployment**: Frontend on Vercel; Backend API + Redis + PostgreSQL on Render; CI/CD via GitHub Actions.
- **Security**: Strict two-layer authorization (Role Guard + Data Scope filter) enforced at NestJS/Prisma service layers.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Render for Backend API | Prevents Vercel serverless timeouts on BullMQ jobs, WebSocket persistent connections, and long-running AI/Stripe requests | — Pending |
| Cloudinary/S3 for File Storage | Avoids local filesystem volatility and provides reliable CDN URLs for payslips and prescriptions | — Pending |
| Two Subscription Tiers (Basic & Premium) | Simplifies plan enforcement, feature gating, and Stripe product structures | — Pending |
| Dynamic Reporting-Line Routing | Resolves approvers using live manager links (`reportingManagerId`) instead of brittle hardcoded user IDs | — Pending |
| Nightly Absence Cron Job | Eliminates runtime report derivation overhead and ensures deterministic attendance records | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-10-26 after initialization*
