# Phase 2 Context: Organization Hierarchy, Employee Management & Cloud Storage

**Phase:** 02 — Organization Hierarchy, Employee Management & Cloud Storage  
**Created:** 2026-10-26  
**Status:** Ready to execute  

## Key Architectural Decisions

1. **Organization Hierarchy Structure**:
   - Company has Departments (e.g. Engineering, Sales, HR, Marketing).
   - Each Department can have a `managerId` referencing an `Employee`.
   - Teams belong to a Department (`departmentId`) and have a `leadId` referencing an `Employee`.
   - Designations belong to the Company (`companyId`) and categorize an employee's title/rank.
2. **Reporting Hierarchy & Line of Command**:
   - Every `Employee` has an optional `reportingManagerId` pointing to another `Employee` in the same tenant.
   - The top of the company hierarchy is the Company Admin (`CEO`), who has `reportingManagerId: null`.
   - Circular reporting lines are prevented at service validation time.
3. **Employee Status Lifecycle**:
   - Statuses: `ACTIVE`, `ON_PROBATION`, `SUSPENDED`, `ON_LEAVE`, `RESIGNED`, `TERMINATED`.
   - When an employee status changes:
     - Audit log entry is written with `AuditAction.STATUS_CHANGE`.
     - In-app notification is dispatched to the employee and reporting manager.
     - Email notification is queued via `MailService`.
     - If status is `SUSPENDED` or `TERMINATED`, the corresponding `User` account is locked from logging in.
4. **Cloud Object Storage Pipeline**:
   - Storage service supports Cloudinary (primary / free tier) with AWS S3 compatibility fallback.
   - Files are validated for MIME type (`image/png`, `image/jpeg`, `image/webp`, `application/pdf`) and size (< 5MB for images, < 10MB for documents).
   - Only secure HTTPS URLs are saved in PostgreSQL (`Employee.profilePictureUrl`, `EmployeeDocument.fileUrl`).
   - Mock storage mode available for offline/test environments without live Cloudinary credentials.
5. **Data Scope Visibility in Directory**:
   - `COMPANY_ADMIN` and `HR_MANAGER`: See all company employees with edit capabilities.
   - `DEPARTMENT_MANAGER`: See all employees in their department.
   - `TEAM_LEAD`: See all employees in their team.
   - `EMPLOYEE`: See public directory information or their own profile.
