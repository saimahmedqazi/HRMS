# Feature Research

**Domain:** Multi-Tenant SaaS HRMS
**Researched:** 2026-10-26
**Confidence:** HIGH

## Feature Analysis

### Table Stakes (Must Have for Launch)

1. **Multi-Tenancy & Tenant Isolation**
   - Unique company registration with complete tenant data isolation (`companyId` on all tables).
   - Platform vs Company layer separation.

2. **Role-Based Access Control (RBAC) & 5 Data Scopes**
   - 7 distinct roles: `SUPER_ADMIN`, `OPERATION_MANAGER`, `COMPANY_ADMIN`, `HR_MANAGER`, `DEPARTMENT_MANAGER`, `TEAM_LEAD`, `EMPLOYEE`.
   - 5 data scopes: `PLATFORM`, `COMPANY`, `DEPARTMENT`, `TEAM`, `SELF`.
   - Scope enforced at database/query level.
   - Super Admin time-limited, audit-logged Support Mode.
   - Company Admin restricted to top-of-chain approvals.

3. **Attendance & Absence Automation**
   - Onsite check-in (instant Present) and authorized Remote Work check-in.
   - Standing two-step Remote Work permission approval.
   - Unauthorized remote check-in detection routed to HR Exceptions Queue.
   - Nightly BullMQ cron job marking unexcused missing check-ins as `Absent`.
   - Optional, consent-gated location metadata capture.
   - Login IP tracking with approximate location display ("You logged in from [place] at [time]") and HR IP Whitelist.

4. **Work Timer & Break Tracking (Premium Plan)**
   - Start, pause, and resume work timer for shift tracking.
   - Instant real-time (Socket.IO) and email notifications on break start to Team Lead, Department Manager, and Company Admin (CEO).
   - Automatic overtime calculation once allowed break and shift window concludes.

5. **Leave Management & Configurable Approval Engine**
   - Casual (reason required), Sick (mandatory medical prescription file upload), and Annual (reason required) leave types.
   - Admin/HR toggle for making reason/prescription mandatory or optional.
   - 3-month probation gating exclusively for `EMPLOYEE` role based on `hireDate`.
   - Dynamic reporting-line routing: `Employee -> Team Lead -> HR Manager (Final)` and `Team Lead -> Dept Manager -> HR Manager (Final)`.
   - HR Leave List modal displaying submitted reason and downloadable prescription.

6. **Resource Requests**
   - Multi-step asset requests: `Employee -> Team Lead (Step 1) -> Department Manager (Step 2) -> Fulfilling Department (Step 3)`.

7. **Payroll & Asynchronous Bulk Uploads**
   - Salary structures, deductions, allowances, tax, and monthly payroll runs.
   - Single and bulk PDF payslip generation and distribution.
   - Limited read-only department payroll summary for Department Managers (hidden from Team Leads).
   - Excel bulk employee upload processed via BullMQ with validation preview and error reporting.

8. **Subscriptions & Stripe Billing**
   - Two tiers: `BASIC` (Core HR; timer, general uploads, AI off; sick prescription upload on) vs `PREMIUM` (all features enabled).
   - Stripe prebuilt payment widget.
   - Automated BullMQ cron retrying payment on subscription end date and Day +1, +2, +3.
   - Tenant suspension lockout after 2 consecutive months of non-payment.

9. **Cloud Object Storage**
   - Multer middleware uploading files to Cloudinary (free tier) or AWS S3, storing only URLs in PostgreSQL.

10. **Gemini AI HR Assistant**
    - Google Gemini API integration scoped strictly to HR/company policy questions for Admins, HR, Managers, and onboarding Employees.

11. **Employee Status Badges & Dashboards**
    - Badges (`Active`, `On probation`, `Suspended`, `On leave`, `Resigned`, `Terminated`) with email and in-app alerts.
    - 7 customized role-scoped dashboard views and Recharts analytics.

### Differentiators (Competitive Advantage)

- **Two-Layer Security Architecture**: True database-layer data scope enforcement ensuring managers and team leads cannot see peer departments or unauthorized rows.
- **Dynamic Live Reporting-Line Engine**: Approvals resolve dynamically via live organizational reporting hierarchy rather than static user ID assignments.
- **Real-Time Break Dispatch**: Instant multi-stakeholder alert dispatch via WebSockets and email ensuring operational accountability without intrusive surveillance.
- **Automated Nightly Absence Cron**: Guaranteed deterministic attendance state without relying on runtime query calculations.

### Anti-Features (Deliberately Excluded)

| Feature | Why Excluded | What to Do Instead |
|---------|--------------|-------------------|
| 10-Minute Screenshot Snapshots | Privacy invasion, OS permission instability, heavy storage load | Work Timer with break tracking |
| Covid-Based Tracking Concepts | Outdated, replaced by modern flexible attendance models | Standing Remote Work permissions & Shift Schedules |
| Deep CTO/CEO Leave Approvals | Over-engineering approval hierarchies for executive staff | HR or CEO directly records executive leave |
| Custom AI Model Training | High cost, operational complexity, training overhead | Google Gemini API with system prompts and context injection |
| Mandatory GPS Check-in Blocking | Geofencing friction, battery drain, privacy rejection | Optional, consent-withdrawable metadata capture |
| Mobile Native Apps (v1) | Extended development timeline beyond 10 Nov 2026 deadline | Responsive Next.js Web App |
