# Phase 3 Context: Attendance, Work Timer & Real-Time Alert Engine

**Phase:** 03 — Attendance, Work Timer & Real-Time Alert Engine  
**Created:** 2026-10-26  
**Status:** Ready to execute  

## Key Architectural Decisions

1. **Check-In Rules & HR Exceptions Queue**:
   - Onsite check-in: Automatically assigns `AttendanceStatus.PRESENT`. Optional opt-in geolocation coordinates stored for auditing, but never blocks check-in if GPS is denied.
   - Remote check-in: Checks if employee has an active `RemoteWorkPermission` for the date.
     - If authorized: Automatically assigns `AttendanceStatus.PRESENT_REMOTE`.
     - If unauthorized: Marks status as `ABSENT_PENDING_REVIEW` and enqueues into the HR Exceptions Queue (`/dashboard/attendance/exceptions`), triggering in-app alert to HR Manager.
     - HR Manager can approve (converts to `PRESENT_REMOTE`) or reject (converts to `ABSENT`).
2. **Work Timer & Break Tracking (Premium Tier)**:
   - Tracks intervals: `workMinutes` vs `breakMinutes`.
   - `START`: Starts work session.
   - `PAUSE`: Pauses work and begins break counter.
   - `RESUME`: Ends current break interval, increments total break minutes.
   - `STOP`: Finalizes session and synchronizes with attendance record.
3. **Real-Time WebSocket & Email Break Alert Engine**:
   - Shift defines `breakDuration` (e.g. 60 minutes).
   - If accumulated break minutes exceed allowed shift threshold:
     - Socket.IO gateway (`AttendanceGateway` / `TimerGateway`) emits `break_alert` event to rooms for:
       - Employee's Team Lead
       - Employee's Department Manager
       - Company Admin (CEO)
     - `MailService` concurrently dispatches email notifications to all 3 stakeholders.
4. **Nightly Absence Job (BullMQ / Cron)**:
   - Runs nightly at 23:59.
   - Queries employees scheduled on the current shift whose work day includes today.
   - Excludes employees already checked in, employees on approved leave (`LeaveRequest.status === APPROVED`), and holidays/weekends.
   - Marks unmarked records as `ABSENT` with `markedBySystem: true`.
5. **Overtime Math**:
   - `overtimeMinutes = Math.max(0, totalWorkMinutes - shiftStandardMinutes)`.
   - Updated synchronously upon checkout or timer completion.
