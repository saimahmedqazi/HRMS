# Plan 04-01 Summary: Generic Reporting-Line Approval Engine & Probation Gating

**Status:** Completed  
**Date:** 2026-10-26  

## Achievements
1. **Dynamic Approval Engine (`ApprovalEngineService`)**:
   - Implemented dynamic 2-step approver chain resolution mapping from requester hierarchy:
     - `EMPLOYEE`: Step 1 -> Team Lead / Reporting Manager / Dept Manager; Step 2 -> HR Manager.
     - `TEAM_LEAD`: Step 1 -> Dept Manager / Reporting Manager; Step 2 -> HR Manager.
     - `DEPARTMENT_MANAGER` & `HR_MANAGER`: Step 1 -> Company Admin (CEO); Step 2 -> Auto-Skipped.
     - `COMPANY_ADMIN`: Auto-Skipped.
   - Built auto-skipping when requester is their own step 1 approver.
   - Built inclusive day counter (`calculateTotalDays`).
2. **Strict 3-Month Probation Gating**:
   - Anchored to employee `hireDate` + 90 days.
   - Blocks employees with role `EMPLOYEE` and status `ON_PROBATION` until probation end date.
   - Rejects with `ForbiddenException('Employees on active probation cannot request leave until [YYYY-MM-DD].')`.
   - Allows managers, admins, and non-probationary employees.
3. **Automated Unit Testing**:
   - `approval-engine.service.spec.ts` completed with 11 tests passing (100% pass rate).
