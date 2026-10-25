# Phase 4 Context: Configurable Approval Engine & Leave Management

**Phase:** 04 — Configurable Approval Engine & Leave Management  
**Created:** 2026-10-26  
**Status:** Ready to execute  

## Key Architectural Decisions

1. **3-Month Probation Gating**:
   - Anchored to employee's `hireDate`:
     `probationEndDate = hireDate + 90 days`.
   - Exclusively gates the `EMPLOYEE` role. (Managers and Admins can take leave as authorized).
   - If `employee.role === 'EMPLOYEE' && employee.status === 'ON_PROBATION' && now < probationEndDate`:
     - Backend rejects leave creation with `ForbiddenException('Employees on active probation cannot request leave until [probationEndDate].')`.
     - Frontend renders an informative amber probation banner with days remaining and disables the "Request Leave" button.
2. **Dynamic 2-Step Reporting-Line Approval Engine**:
   - `Employee` requester:
     - Step 1: Team Lead (`employee.team.leadId` or `employee.reportingManagerId`)
     - Step 2: HR Manager (`role: HR_MANAGER`)
   - `Team Lead` requester:
     - Step 1: Department Manager (`employee.department.managerId` or `employee.reportingManagerId`)
     - Step 2: HR Manager
   - `Department Manager` requester:
     - Step 1: Company Admin (CEO)
   - Auto-skips steps if requester is their own approver.
3. **Leave Types & Prescription Uploads**:
   - `CASUAL`: Reason mandatory (by company toggle), no prescription.
   - `SICK`: Mandatory medical prescription file upload (Cloudinary/S3).
   - `ANNUAL`: Balance deduction from annual quota.
   - HR Leave modal includes direct prescription download button (`GET /api/v1/leave/requests/:id/prescription`).
4. **Leave Balances**:
   - When a leave request is submitted: `pendingDays += totalDays`.
   - When approved: `pendingDays -= totalDays`, `usedDays += totalDays`.
   - When rejected/withdrawn: `pendingDays -= totalDays`.
5. **Resource Requests**:
   - Team Lead submits equipment / software request.
   - Dept Manager approves or rejects.
   - Fulfilling department fulfills and marks closed.
