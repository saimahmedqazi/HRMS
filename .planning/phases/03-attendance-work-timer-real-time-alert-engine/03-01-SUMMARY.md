# Summary 03-01: Attendance Core, Remote Permissions & HR Exceptions Queue

**Phase:** 03 — Attendance, Work Timer & Real-Time Alert Engine  
**Status:** Completed  
**Completed Date:** 2026-10-26  

## Deliverables & Key Changes
1. **Attendance Check-in / Checkout**:
   - `POST /api/v1/attendance/check-in`: Handles onsite check-in (`PRESENT`) and remote check-in. Captures client IP and opt-in location coordinates without blocking on GPS denial.
   - Remote check-in workflow: Validates active `RemoteWorkPermission`.
     - Authorized -> Sets `PRESENT_REMOTE`.
     - Unauthorized -> Sets `ABSENT_PENDING_REVIEW` and enqueues into HR Exceptions Queue with real-time WebSocket alert and email dispatch to HR Manager.
   - `POST /api/v1/attendance/check-out`: Calculates shift duration and automatic overtime (`overtimeMinutes = Math.max(0, workMinutes - shiftStandardMinutes)`).
   - `GET /api/v1/attendance/today`: Real-time status for calling employee.
   - `GET /api/v1/attendance/records`: Scoped history queries (date range, department, employee).
2. **Standing Remote Work Permissions**:
   - `POST /api/v1/attendance/remote-permissions`: Submit multi-day remote work requests.
   - 2-step approval chain: Team Lead step 1 approval (`PATCH .../step1`) + Department Manager step 2 approval (`PATCH .../step2`).
3. **HR Exceptions Queue**:
   - `GET /api/v1/attendance/exceptions`: Lists pending `ABSENT_PENDING_REVIEW` check-ins.
   - `POST /api/v1/attendance/exceptions/:id/resolve`: HR approves (converts to `PRESENT_REMOTE`) or rejects (marks `ABSENT`) with employee notification.
4. **Unit Tests**:
   - `attendance.service.spec.ts` -> 6 tests passed.

## Verification
- Unit test suite passed.
- Backend typecheck passed.
