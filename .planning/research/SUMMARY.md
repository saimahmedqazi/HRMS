# Project Research Summary

**Project:** ZenHR Multi-Tenant SaaS HRMS
**Domain:** Enterprise SaaS Human Resource Management System
**Researched:** 2026-10-26
**Confidence:** HIGH

## Executive Summary

ZenHR is a multi-tenant SaaS Human Resource Management System built to serve multiple companies on a single, highly isolated platform. The system operates across 7 user roles (`SUPER_ADMIN`, `OPERATION_MANAGER`, `COMPANY_ADMIN`, `HR_MANAGER`, `DEPARTMENT_MANAGER`, `TEAM_LEAD`, and `EMPLOYEE`) and enforces two distinct security layers: tenant isolation via `companyId` and row-level data scope filtering (`PLATFORM`, `COMPANY`, `DEPARTMENT`, `TEAM`, `SELF`).

To meet the hard deadline of 10 November 2026 and supervisor specifications, the platform combines a modern Next.js App Router frontend on Vercel with a persistent NestJS backend on Render. This architecture prevents serverless timeouts during BullMQ background processing (Excel imports, nightly absence jobs, and Stripe retry crons) and supports persistent WebSocket connections for real-time break notifications and system updates.

Key technical decisions include strictly storing file uploads on Cloudinary/AWS S3 (persisting only HTTPS URLs in PostgreSQL), integrating Google Gemini API out-of-the-box with context injection for HR assistance (no model training), two-tier subscription gating (Basic vs Premium), and a generic reporting-line approval engine for Leave, Remote Work, and Resource Requests.

## Key Findings

### Recommended Stack

ZenHR is structured as a full-stack TypeScript application with clean separation between the presentation, service, and data layers:
- **Frontend**: Next.js (App Router), React, TypeScript (`strict: true`), Tailwind CSS, ShadCN UI, TanStack Query, React Hook Form, Zod, and Recharts.
- **Backend API**: Node.js, NestJS, PostgreSQL 16, Prisma ORM, JWT + Refresh tokens in `httpOnly` secure cookies, Socket.IO, Nodemailer, BullMQ, and Redis 7.
- **Backing Services**: Cloudinary (free tier) or AWS S3 for object storage, Stripe prebuilt payment widget, and Google Gemini API for HR assistance.
- **Infrastructure**: Frontend deployed on Vercel; Backend API, PostgreSQL, and Redis hosted on Render.

**Core technologies:**
- Next.js: Responsive App Router frontend with server components and ShadCN UI.
- NestJS: Robust modular architecture enforcing SOLID principles and query-level security guards.
- PostgreSQL & Prisma: Multi-tenant relational data modeling with composite `companyId` indexing.
- Redis & BullMQ: Persistent background job queues and nightly cron automation.

### Expected Features

**Must have (table stakes):**
- Strict multi-tenant isolation and 7-role RBAC with 5 data scopes enforced in database queries.
- Attendance check-in/out (Onsite instant Present, authorized Remote check-in, unauthorized HR Exceptions Queue).
- Work Timer (Premium plan) with instant Socket.IO and email break notifications to Team Lead, Dept Manager, and CEO, plus automatic overtime calculation.
- Nightly BullMQ absence cron marking unexcused days as Absent.
- Login IP tracking with approximate geolocation display ("You logged in from [place] at [time]") and HR IP Whitelist.
- Leave management (Casual, Sick with prescription upload, Annual) with Admin/HR mandatory toggle, 3-month probation gating on Employee role only, and reporting-line approval chain.
- HR Leave detail modal with direct prescription download button.
- Resource Request workflow (Team Lead -> Dept Manager -> Fulfilling Department).
- Payroll management with salary structures, single/bulk PDF payslips, and limited read-only summary for Dept Managers.
- Excel bulk employee upload with preview, asynchronous BullMQ processing, and error reporting.
- Two subscription tiers (Basic vs Premium) with Stripe widget checkout, 3-day retry cron (Day +1, +2, +3), and 2-month non-payment lockout.
- Cloudinary/S3 file storage saving only HTTPS URLs.
- Google Gemini AI HR assistant scoped to HR topics.
- Employee status badges (`Active`, `On probation`, `Suspended`, `On leave`, `Resigned`, `Terminated`) with alerts.
- 7 role-scoped dashboards and Recharts analytics.
- Production deployment configuration on Vercel and Render with `.env.example`.

**Should have (competitive):**
- Dynamic organizational hierarchy routing (approvers determined from live reporting lines).
- Super Admin audit-logged, time-limited Support/Impersonation Mode.
- Real-time instant Socket.IO push alerts synchronized with email notifications.

**Defer (v2+):**
- Native mobile applications (iOS/Android) — Next.js responsive web UI serves mobile users in v1.
- Custom enterprise SSO/SAML integrations.

### Architecture Approach

The platform decouples the frontend client (Vercel) from the stateful API server and background workers (Render). All incoming requests pass through NestJS authentication and data scope guards, ensuring tenant isolation is applied at the query level. Long-running tasks are offloaded to BullMQ workers backed by Redis, while Socket.IO gateways broadcast real-time events to role-scoped user rooms.

**Major components:**
1. Next.js Web App: Responsive client application containing role-filtered navigation and ShadCN components.
2. NestJS API Core: REST controllers, services, Prisma extensions, and WebSocket gateway.
3. BullMQ Worker Suite: Asynchronous processing for Excel imports, nightly absences, and Stripe retries.
4. Storage & Database Tier: PostgreSQL relational store, Redis in-memory broker, and Cloudinary/S3 object storage.

### Critical Pitfalls

1. **Cross-Tenant Data Leakage**: Mitigated by Prisma Client extensions automatically injecting `companyId` into queries and multi-tenant test suites.
2. **Serverless Timeouts**: Mitigated by deploying backend API and background workers to Render rather than serverless functions.
3. **Client-Side Data Scope Bypasses**: Mitigated by server-side `DataScopeInterceptor` and row-level query filtering.
4. **Ephemeral Filesystem Data Loss**: Mitigated by uploading all files directly to Cloudinary/S3 and storing strictly URLs in PostgreSQL.
5. **Inconsistent Attendance Records**: Mitigated by an automated nightly BullMQ cron job writing definitive daily attendance records.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Core Multi-Tenant Architecture & RBAC Engine
**Rationale:** The foundation of the entire system. Multi-tenant isolation and two-layer RBAC must be proven before any business modules are built.
**Delivers:** Monorepo structure, PostgreSQL schema, Prisma migrations, multi-tenant middleware, JWT authentication in httpOnly cookies, 7 user roles, 5 data scopes, and Super Admin Support Mode.
**Addresses:** Multi-tenancy, RBAC, Two-Layer Authorization.
**Avoids:** Cross-tenant data leaks and client-side authorization bypasses.

### Phase 2: Organization Hierarchy, Employee Management & Cloud Storage
**Rationale:** All approvals and attendance records depend on companies, departments, designations, and employees.
**Delivers:** Departments, designations, employee directory, profile management, status badges, emergency contacts, and Multer + Cloudinary/S3 upload pipeline.
**Addresses:** Company structure, Employee CRUD, Status Badges, Cloud Object Storage.
**Avoids:** Ephemeral filesystem data loss on production deployments.

### Phase 3: Attendance, Work Timer & Real-Time Engine
**Rationale:** Core operational module. Attendance tracking, work timers, and break alerts represent supervisor priority #1 and #2.
**Delivers:** Onsite and remote check-in, standing two-step Remote Work permission, unauthorized check-in HR Exceptions Queue, Work Timer (Premium), Socket.IO + email break alerts, overtime calculation, nightly absence BullMQ cron, login IP tracking, and HR IP Whitelist.
**Addresses:** Attendance, Work Timer, Break Notifications, Overtime, Nightly Absence Cron, IP Whitelist.
**Avoids:** Flaky attendance records and serverless timeout issues.

### Phase 4: Configurable Approval Engine & Leave Management
**Rationale:** Leverages reporting-line hierarchy from Phase 2 and absence tracking from Phase 3.
**Delivers:** Generic configurable approval engine, 3-month probation gating exclusively for Employee role based on `hireDate`, Casual/Sick/Annual leave workflows, Admin/HR mandatory toggle, HR leave list modal with prescription download, and Resource Request workflow.
**Addresses:** Leave management, Probation rules, Prescription downloads, Resource Requests.
**Avoids:** Hardcoded approval flows and unverified medical leave.

### Phase 5: Payroll & Bulk Processing Pipeline
**Rationale:** Relies on validated attendance data, overtime hours, and employee salary profiles.
**Delivers:** Salary structures, allowances, deductions, tax calculation, monthly payroll execution, single and bulk PDF payslip generation, limited read-only department payroll summary for Department Managers, and BullMQ Excel bulk employee import worker.
**Addresses:** Payroll management, PDF payslips, Excel bulk import.
**Avoids:** Request timeout bottlenecks on large employee imports.

### Phase 6: Subscriptions, Gemini AI Assistant & Security Hardening
**Rationale:** Commercial monetization and AI capability layer once core operational modules are functional.
**Delivers:** Two subscription tiers (Basic vs Premium), Stripe prebuilt payment widget, BullMQ 3-day retry cron (Day +1, +2, +3), 2-month non-payment lockout, Google Gemini API HR assistant with topic guardrails, rate limiting, and security audit log.
**Addresses:** Stripe Subscriptions, Plan Gating, Payment Retries, Gemini AI Assistant.
**Avoids:** Revenue leakage, unhandled Stripe failure webhooks, and AI prompt drift.

### Phase 7: Analytics, Dashboards & Production Deployment
**Rationale:** Final aggregation layer, visual reporting, and production hosting ahead of the 10 November 2026 deadline.
**Delivers:** 7 role-scoped dashboards, Recharts analytics modules, production Docker & Nginx configurations, Vercel frontend deployment, Render backend deployment, GitHub Actions CI/CD, and `.env.example` templates.
**Addresses:** Dashboards, Analytics, Production Deployment, FYP Viva Deliverables.
**Avoids:** Deployment surprises and missing environment variable configurations.

### Phase Ordering Rationale

- Foundation (Phase 1) precedes company and employee records (Phase 2).
- Employee hierarchy (Phase 2) is required to route attendance, timers, and break notifications (Phase 3).
- Reporting-lines and attendance status feed directly into leave approvals and probation gating (Phase 4).
- Attendance and overtime data feed into monthly payroll calculations (Phase 5).
- Feature modules must exist before plan gating and AI context injection (Phase 6).
- Role-scoped dashboards and production deployment finalize the verified platform (Phase 7).

### Research Flags

- **Phase 3:** Needs careful Socket.IO room design for multi-tenant notifications (`user:{id}`, `company:{id}`).
- **Phase 4:** Approval engine requires recursive reporting line lookup (`reportingManagerId`) with graceful fallbacks.
- **Phase 5:** PDF generation in NestJS (using Puppeteer or PDFKit) requires proper font bundling on Render.
- **Phase 6:** Stripe webhook signature verification and Gemini context injection require strict environment secret isolation.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Validated against Next.js, NestJS, Prisma, BullMQ, and Redis enterprise best practices |
| Features | HIGH | Fully aligned with 27-page ZenHR spec v2.1 and supervisor requirements |
| Architecture | HIGH | Decoupled Vercel/Render architecture eliminates serverless timeout risks |
| Pitfalls | HIGH | Specific mitigations identified for multi-tenancy, file storage, and background jobs |

**Overall confidence:** HIGH

### Gaps to Address

- Verify Cloudinary free-tier bandwidth quotas vs AWS S3 credentials during deployment phase.
- Validate exact IP-geolocation API service (e.g. MaxMind GeoLite2 or ip-api) for login location tracking.

## Sources

### Primary (HIGH confidence)
- ZenHR — Functional & Role-Based Requirements Specification (v2.1)
- Supervisor Project Requirements Brief (`req.docx`)
- NestJS Official Documentation & Architectural Best Practices
- Next.js App Router Documentation
- Prisma Multi-Tenant Extension Guide
- BullMQ Background Job Architecture Guide

---
*Research completed: 2026-10-26*
*Ready for roadmap: yes*
