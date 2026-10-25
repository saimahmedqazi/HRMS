# Requirements: ZenHR Multi-Tenant SaaS HRMS

**Defined:** 2026-10-26
**Core Value:** Rock-solid multi-tenant data isolation and role-scoped operational workflows delivering an enterprise-grade HRMS with zero cross-tenant data leakage.

## v1 Requirements

### Multi-Tenancy & RBAC

- [ ] **TENANT-01**: System isolates tenant data by mandatory `companyId` foreign key on all company-owned database tables with query-level enforcement.
- [ ] **TENANT-02**: Platform-level Super Admin can create, inspect, suspend, and reactivate companies with associated subscription tiers.
- [ ] **TENANT-03**: System provides an explicit, time-limited, reason-logged Support/Impersonation Mode for Super Admin to access tenant operational data with complete audit logging.
- [ ] **RBAC-01**: System enforces 7 distinct user roles (`SUPER_ADMIN`, `OPERATION_MANAGER`, `COMPANY_ADMIN`, `HR_MANAGER`, `DEPARTMENT_MANAGER`, `TEAM_LEAD`, `EMPLOYEE`) across backend controller guards and frontend navigation.
- [ ] **RBAC-02**: System enforces 5 data scopes (`PLATFORM`, `COMPANY`, `DEPARTMENT`, `TEAM`, `SELF`) at the service and Prisma query layer.
- [ ] **RBAC-03**: Operation Manager role has read-only platform dashboard and company status access with zero billing or company mutation permissions.
- [ ] **RBAC-04**: Company Admin is restricted to top-of-chain approvals only (HR Manager requests and Dept Manager fallbacks), preventing routine attendance/leave approvals.
- [ ] **RBAC-05**: JWT authentication issues access and refresh tokens stored strictly in secure, httpOnly cookies with CSRF protection and rate limiting.

### Organization & Employee Management

- [ ] **ORG-01**: Company Admin and HR Manager can perform full CRUD on departments and designations.
- [ ] **ORG-02**: System models organizational reporting hierarchy via `reportingManagerId` on employee profiles.
- [ ] **EMP-01**: HR Manager can perform full CRUD on employee records, emergency contacts, education, experience, skills, and bank details.
- [ ] **EMP-02**: System renders prominent status badges (`Active`, `On probation`, `Suspended`, `On leave`, `Resigned`, `Terminated`) on employee profiles and directory tables.
- [ ] **EMP-03**: System sends in-app and email notifications to employee and HR when an employee is placed on probation or suspended.
- [ ] **EMP-04**: Employees can view and update their own personal profiles, documents, and emergency contacts.

### Attendance, Work Timer & Real-Time Notifications

- [ ] **ATT-01**: Employee can check in/out Onsite with immediate `Present` status.
- [ ] **ATT-02**: Employee with an active, approved Remote Work permission can check in as `Present (Remote)`.
- [ ] **ATT-03**: Unauthorized remote check-in marks employee as `Absent (Pending Review)` and dispatches record to HR Exceptions Queue.
- [ ] **ATT-04**: System captures optional, consent-gated location metadata at check-in (consent withdrawable in Settings anytime) without blocking check-in.
- [ ] **ATT-05**: System captures client IP and approximate geolocation upon login, displaying "You logged in from [place] at [time]" on profile.
- [ ] **ATT-06**: HR Manager can maintain an IP Whitelist for remote/hybrid employees, routing non-whitelisted office network check-ins to HR Exceptions Queue.
- [ ] **ATT-07**: Nightly BullMQ scheduled cron job marks employees `Absent` if no check-in, approved leave, or remote permission exists by end of day.
- [ ] **TIMER-01**: Work Timer is gated behind the `PREMIUM` subscription tier with start, pause, and stop controls.
- [ ] **TIMER-02**: Pausing work timer for a break dispatches real-time Socket.IO and email notifications to Team Lead, Department Manager, and Company Admin (CEO).
- [ ] **TIMER-03**: System automatically calculates and logs overtime minutes on daily attendance once allowed shift and break window concludes.

### Leave Management & Configurable Approval Engine

- [ ] **LEAVE-01**: System supports Casual, Sick, and Annual leave types with annual balance allocations configurable per company.
- [ ] **LEAVE-02**: 3-month probation gating applies exclusively to `EMPLOYEE` role anchored to `hireDate`, displaying probation end date banner and allocating balances upon completion.
- [ ] **LEAVE-03**: Casual/Annual leave requires written reason and Sick leave requires medical prescription file upload by default, controllable via Admin/HR company setting toggle.
- [ ] **LEAVE-04**: Leave requests route through reporting lines: `Employee -> Team Lead (Step 1) -> HR Manager (Final)` and `Team Lead -> Dept Manager (Step 1) -> HR Manager (Final)`.
- [ ] **LEAVE-05**: HR Manager can view company-wide leave list and open detail modal displaying reason and direct download link for uploaded medical prescription.
- [ ] **LEAVE-06**: System decrements leave balances and marks attendance as `On Leave` upon final approval, restoring balances upon cancellation.
- [ ] **APPR-01**: Shared configurable approval routing engine resolves approvers dynamically from requester's reporting line (`reportingManagerId`) with auto-skip for top tiers.
- [ ] **APPR-02**: Standing Remote Work permission workflow routes via Direct Manager (Step 1) -> HR Manager (Final Approval) with revocation controls.
- [ ] **RES-01**: Resource Request workflow routes via Team Lead (Step 1) -> Department Manager (Step 2) -> Fulfilling Department (Step 3).

### Payroll & Bulk Data Pipeline

- [ ] **PAY-01**: HR Manager can configure salary structures, allowances, bonuses, deductions, and tax calculation rules.
- [ ] **PAY-02**: HR Manager can execute monthly payroll runs and generate single and bulk PDF payslips.
- [ ] **PAY-03**: Department Manager can view own payslip plus a limited read-only summary of department payroll, while team payroll remains hidden from Team Leads.
- [ ] **PAY-04**: Employees and Team Leads can view and download only their own payslips and salary revision history.
- [ ] **BULK-01**: HR Manager can upload Excel (`.xlsx`) files for bulk employee onboarding with validation preview.
- [ ] **BULK-02**: System processes bulk employee imports asynchronously via BullMQ worker to prevent HTTP request timeouts.
- [ ] **BULK-03**: System generates downloadable error reports for failed rows in bulk imports while committing valid records.

### Subscriptions, Stripe Billing & File Storage

- [ ] **BILL-01**: System enforces two subscription tiers: `BASIC` (Core HR on; Work Timer, file uploads, AI off; Sick prescription upload on) and `PREMIUM` (all features on).
- [ ] **BILL-02**: Integrated Stripe prebuilt checkout widget for frontend subscription purchase and payment method updates.
- [ ] **BILL-03**: Scheduled BullMQ cron job attempts payment on subscription renewal date, retrying failed payments on Day +1, Day +2, and Day +3 with exact error logging.
- [ ] **BILL-04**: Two consecutive months of non-payment transitions tenant to `Suspended (Non-Payment)` and blocks all tenant sessions until payment succeeds.
- [ ] **FILE-01**: Multer upload middleware uploads documents and medical prescriptions to Cloudinary or AWS S3, persisting only secure HTTPS URLs in PostgreSQL.
- [ ] **FILE-02**: System restricts general file uploads to `PREMIUM` plan, while allowing Sick Leave prescription uploads on all tiers.

### Gemini AI Assistant & Security Hardening

- [ ] **AI-01**: Google Gemini API assistant is integrated out-of-the-box with system prompts and context injection without custom model training.
- [ ] **AI-02**: Gemini AI assistant enforces strict HR-only domain guardrails, accessible to Admin, HR, Managers, and onboarding Employees.
- [ ] **AI-03**: Super Admin can configure platform-wide AI usage quotas, with in-app alerts when company limits are approached.
- [ ] **SEC-01**: Application security enforces Helmet headers, CORS policies, XSS sanitization, and parameterized Prisma queries.
- [ ] **SEC-02**: Sensitive actions and administrative operations are recorded in an immutable audit log.

### Dashboards, Analytics & Production Operations

- [ ] **DASH-01**: System provides 7 customized dashboard views tailored to the specific role and data scope of the logged-in user.
- [ ] **DASH-02**: Analytics module provides interactive Recharts visualizations for attendance trends, presence graph, payroll, and subscription metrics.
- [ ] **OPS-01**: Frontend workspace includes Next.js production build configuration and environment templates (`.env.example`) for Vercel deployment.
- [ ] **OPS-02**: Backend workspace includes NestJS Docker, Nginx, and environment templates (`.env.example`) for Render deployment with PostgreSQL and Redis.
- [ ] **OPS-03**: GitHub Actions CI/CD workflows run linting, typechecks (`tsc --noEmit`), and build verification on push.

## v2 Requirements

### Deferred Features

- **SSO-01**: Enterprise SAML / Single Sign-On integration for large enterprise tenants.
- **MOB-01**: Native iOS and Android mobile applications using React Native.
- **KUDOS-01**: Peer-to-peer employee recognition and internal kudos feed.
- **EXP-01**: Multi-currency expense claims and travel reimbursement module.

## Out of Scope

| Feature | Reason |
|---------|--------|
| 10-Minute Screenshot Snapshots | Rejected due to privacy invasion, OS background bugs, and heavy storage load. |
| Covid-Based Tracking Concepts | Replaced by modern shift schedules and Work Timer. |
| Deep CTO/CEO Leave Approvals | Executive leave is recorded directly by HR or CEO without approval chains. |
| Custom AI Model Training | Google Gemini API with system prompts and context injection satisfies all requirements. |
| Mandatory GPS Check-In Blocking | Privacy invasion; location is captured strictly as optional opt-in metadata. |
| Biometric / Facial Recognition Check-In | Hardware and privacy overhead not required for software HRMS. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TENANT-01 | Phase 1 | Pending |
| TENANT-02 | Phase 1 | Pending |
| TENANT-03 | Phase 1 | Pending |
| RBAC-01 | Phase 1 | Pending |
| RBAC-02 | Phase 1 | Pending |
| RBAC-03 | Phase 1 | Pending |
| RBAC-04 | Phase 1 | Pending |
| RBAC-05 | Phase 1 | Pending |
| ORG-01 | Phase 2 | Pending |
| ORG-02 | Phase 2 | Pending |
| EMP-01 | Phase 2 | Pending |
| EMP-02 | Phase 2 | Pending |
| EMP-03 | Phase 2 | Pending |
| EMP-04 | Phase 2 | Pending |
| FILE-01 | Phase 2 | Pending |
| ATT-01 | Phase 3 | Pending |
| ATT-02 | Phase 3 | Pending |
| ATT-03 | Phase 3 | Pending |
| ATT-04 | Phase 3 | Pending |
| ATT-05 | Phase 3 | Pending |
| ATT-06 | Phase 3 | Pending |
| ATT-07 | Phase 3 | Pending |
| TIMER-01 | Phase 3 | Pending |
| TIMER-02 | Phase 3 | Pending |
| TIMER-03 | Phase 3 | Pending |
| LEAVE-01 | Phase 4 | Pending |
| LEAVE-02 | Phase 4 | Pending |
| LEAVE-03 | Phase 4 | Pending |
| LEAVE-04 | Phase 4 | Pending |
| LEAVE-05 | Phase 4 | Pending |
| LEAVE-06 | Phase 4 | Pending |
| APPR-01 | Phase 4 | Pending |
| APPR-02 | Phase 4 | Pending |
| RES-01 | Phase 4 | Pending |
| PAY-01 | Phase 5 | Pending |
| PAY-02 | Phase 5 | Pending |
| PAY-03 | Phase 5 | Pending |
| PAY-04 | Phase 5 | Pending |
| BULK-01 | Phase 5 | Pending |
| BULK-02 | Phase 5 | Pending |
| BULK-03 | Phase 5 | Pending |
| BILL-01 | Phase 6 | Pending |
| BILL-02 | Phase 6 | Pending |
| BILL-03 | Phase 6 | Pending |
| BILL-04 | Phase 6 | Pending |
| FILE-02 | Phase 6 | Pending |
| AI-01 | Phase 6 | Pending |
| AI-02 | Phase 6 | Pending |
| AI-03 | Phase 6 | Pending |
| SEC-01 | Phase 6 | Pending |
| SEC-02 | Phase 6 | Pending |
| DASH-01 | Phase 7 | Pending |
| DASH-02 | Phase 7 | Pending |
| OPS-01 | Phase 7 | Pending |
| OPS-02 | Phase 7 | Pending |
| OPS-03 | Phase 7 | Pending |

**Coverage:**
- v1 requirements: 54 total
- Mapped to phases: 54
- Unmapped: 0 ✓

---
*Requirements defined: 2026-10-26*
*Last updated: 2026-10-26 after initial definition*
