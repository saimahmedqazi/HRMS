import { TimerStatus, type Prisma, type Shift } from '@prisma/client';
import { previousAttendanceDate, type AttendanceTime } from './attendance-date';

export type ShiftSchedule = Pick<Shift, 'startTime' | 'endTime' | 'workDays' | 'breakDuration'>;
type EmployeeScope = { companyId: string; employeeId: string };
type AttendanceDates = { date: Date; previousDate: Date };

const scheduleFields = { name: true, startTime: true, endTime: true, workDays: true, breakDuration: true } as const;

export function clockMinutes(time: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function overnightShiftEnd(shift?: ShiftSchedule | null): number | null {
  if (!shift) return null;
  const start = clockMinutes(shift.startTime);
  const end = clockMinutes(shift.endTime);
  return start !== null && end !== null && end < start ? end : null;
}

export function shiftStandardMinutes(shift?: ShiftSchedule | null): number {
  if (!shift) return 480;
  const start = clockMinutes(shift.startTime);
  const end = clockMinutes(shift.endTime);
  return start === null || end === null || start === end ? 480 : (end - start + 1440) % 1440;
}

export function shiftRevisionSelection(date: Date) {
  return { ...scheduleFields, revisions: {
    where: { effectiveDate: { lte: date } },
    orderBy: { effectiveDate: 'desc' as const },
    take: 2,
  } };
}

export function scheduleOn<T extends ShiftSchedule>(shift: (T & { revisions?: import('@prisma/client').ShiftRevision[] }) | null | undefined, date: Date) {
  if (!shift) return null;
  const { revisions, ...base } = shift;
  const revision = revisions?.find((item) => item.effectiveDate <= date);
  return { ...base, ...revision, revision };
}

export function activeShiftWhere(now: Date, companyId: string): Prisma.EmployeeShiftWhereInput {
  return {
    companyId,
    effectiveFrom: { lte: now },
    OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
  };
}

export async function resolveEmployeeAttendanceDay(
  prisma: Pick<Prisma.TransactionClient, 'employeeShift' | 'shift'>,
  scope: EmployeeScope,
  now: Date,
  local: AttendanceTime,
) {
  const selection = shiftRevisionSelection(local.date);
  const assignment = await prisma.employeeShift.findFirst({
    where: { employeeId: scope.employeeId, ...activeShiftWhere(now, scope.companyId) },
    orderBy: [{ effectiveFrom: 'desc' }, { id: 'asc' }],
    select: { shift: { select: selection } },
  });
  const base = assignment?.shift ?? await prisma.shift.findFirst({
    where: { companyId: scope.companyId, isDefault: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: selection,
  });
  const previousDate = previousAttendanceDate(local.date);
  const priorShift = scheduleOn(base, previousDate);
  const end = overnightShiftEnd(priorShift);
  const previousWorkDay = previousDate.getUTCDay() || 7;
  const isOvernightTail = end !== null &&
    local.hour * 60 + local.minute < end &&
    priorShift?.workDays.includes(previousWorkDay);
  return { date: isOvernightTail ? previousDate : local.date, previousDate, shift: isOvernightTail ? priorShift : scheduleOn(base, local.date) };
}

export function findCurrentPunch(
  prisma: Pick<Prisma.TransactionClient, 'attendanceRecord'>,
  scope: EmployeeScope,
  dates: AttendanceDates,
) {
  return prisma.attendanceRecord.findFirst({
    where: {
      ...scope,
      OR: [
        { date: dates.date },
        { date: dates.previousDate, checkInTime: { not: null }, checkOutTime: null, finalizedAt: null, status: { not: 'MISSING_CHECKOUT' } },
      ],
    },
    orderBy: [
      { checkOutTime: { sort: 'asc', nulls: 'first' } },
      { checkInTime: { sort: 'desc', nulls: 'last' } },
      { date: 'desc' },
    ],
  });
}

export function findCurrentTimer(
  prisma: Pick<Prisma.TransactionClient, 'workTimerEntry'>,
  scope: EmployeeScope,
  dates: AttendanceDates,
) {
  return prisma.workTimerEntry.findFirst({
    where: {
      ...scope,
      OR: [
        { date: dates.date },
        { date: dates.previousDate, status: { in: [TimerStatus.RUNNING, TimerStatus.PAUSED] } },
      ],
    },
    // RUNNING and PAUSED precede STOPPED in the Prisma/PostgreSQL enum.
    orderBy: [{ status: 'asc' }, { date: 'desc' }, { startedAt: 'desc' }],
    include: { breaks: true },
  });
}
