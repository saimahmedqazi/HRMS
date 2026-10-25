# Plan 04-02 Summary: Leave Workflows, Prescription Uploads & HR Modal

**Status:** Completed  
**Date:** 2026-10-26  

## Achievements
1. **Leave Service Core**:
   - `ensureDefaultLeaveTypes` auto-seeds CASUAL (10d), SICK (14d, medical cert required), and ANNUAL (14d).
   - `createLeaveRequest`:
     - Enforces probation gating.
     - Validates leave balance sufficiency.
     - Enforces mandatory doctor prescription document upload for `SICK` leave via `StorageService` (`prescriptions` folder).
     - Increments `pending` days in `LeaveBalance`.
     - Emits in-app notification to Step 1 approver.
   - `approveStep1`: Step 1 decision. If final, moves pending to used days. If rejected, restores pending days.
   - `approveStep2`: Step 2 HR decision. Finalizes approval and moves pending to used days in `LeaveBalance`.
   - `cancelLeaveRequest`: Allows employee to cancel pending leave and restores pending balance days.
   - `getPrescriptionDownload`: Direct prescription download endpoint for HR Managers and Admins.
2. **Leave Controller**:
   - Registered endpoints under `/api/v1/leave`.
   - Added Swagger documentation and role guards.
3. **Automated Testing**:
   - `leave.service.spec.ts` completed with 8 tests passing (100% pass rate).
