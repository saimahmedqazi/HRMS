import { AttendanceStatus, type Prisma, type ShiftRevision } from '@prisma/client';
import { getAttendanceDay } from './attendance-date';
import { clockMinutes, overnightShiftEnd, shiftStandardMinutes, type ShiftSchedule } from './attendance-shift';

export function punchPolicy(shift: (ShiftSchedule & { revision?: ShiftRevision }) | null, date: Date, timezone = 'UTC') {
  const breakDuration = shift?.breakDuration ?? 0;
  const net = Math.max(1, shiftStandardMinutes(shift) - breakDuration);
  return {
    breakDuration,
    requiredMinutes: shift?.revision?.requiredMinutes ?? net,
    halfDayMinutes: shift?.revision?.halfDayMinutes ?? Math.ceil(net / 2),
    fullDayMinutes: shift?.revision?.fullDayMinutes ?? net,
    overtimeEnabled: shift?.revision?.overtimeEnabled ?? true,
    overtimeCapMinutes: shift?.revision?.overtimeCapMinutes ?? null,
    scheduled: (shift?.workDays ?? [1, 2, 3, 4, 5]).includes(date.getUTCDay() || 7),
    overnightEnd: overnightShiftEnd(shift),
    timezone,
  };
}

export function savedPunchPolicy(value: Prisma.JsonValue | undefined) {
  return value as ReturnType<typeof punchPolicy> | null | undefined;
}

export function netWorkMinutes(elapsedMs: number, policy: ReturnType<typeof punchPolicy>, timerMinutes?: number) {
  return timerMinutes ?? Math.max(0, Math.floor(elapsedMs / 60000) - policy.breakDuration);
}

export function classifyWork(workMinutes: number, policy: ReturnType<typeof punchPolicy>, isRemote: boolean) {
  const status = workMinutes >= policy.fullDayMinutes
    ? (isRemote ? AttendanceStatus.PRESENT_REMOTE : AttendanceStatus.PRESENT)
    : workMinutes >= policy.halfDayMinutes
      ? AttendanceStatus.HALF_DAY
      : policy.scheduled ? AttendanceStatus.ABSENT : AttendanceStatus.WEEKEND;
  const overtimeMinutes = policy.overtimeEnabled && workMinutes >= policy.fullDayMinutes
    ? Math.min(policy.overtimeCapMinutes ?? Infinity, Math.max(0, workMinutes - policy.requiredMinutes))
    : 0;
  return { status, overtimeMinutes };
}

export function missingCheckoutDue(date: Date, policy: ReturnType<typeof punchPolicy>, now: Date) {
  const local = getAttendanceDay(now, policy.timezone);
  const cutoff = date.getTime() + 86400000;
  return local.date.getTime() > cutoff || (local.date.getTime() === cutoff &&
    local.hour * 60 + local.minute >= (policy.overnightEnd ?? 0));
}

export function validPolicyDurations(policy: Pick<ShiftRevision, 'startTime' | 'endTime' | 'breakDuration' | 'requiredMinutes' | 'halfDayMinutes' | 'fullDayMinutes' | 'overtimeEnabled' | 'overtimeCapMinutes'>) {
  const start = clockMinutes(policy.startTime);
  const end = clockMinutes(policy.endTime);
  if (start === null || end === null || start === end) return false;
  const span = (end - start + 1440) % 1440;
  return policy.requiredMinutes <= span - policy.breakDuration &&
    policy.halfDayMinutes < policy.fullDayMinutes &&
    policy.fullDayMinutes <= policy.requiredMinutes &&
    (policy.overtimeEnabled || policy.overtimeCapMinutes == null);
}
