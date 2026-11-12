import { TimerStatus, type Prisma, type Shift } from '@prisma/client';
import { previousAttendanceDate, type AttendanceTime } from './attendance-date';

type ShiftSchedule = Pick<Shift, 'startTime' | 'endTime' | 'workDays' | 'breakDuration'>;
type EmployeeScope = { companyId: string; employeeId: string };
type AttendanceDates = { date: Date; previousDate: Date };

const scheduleFields = { startTime: true, endTime: true, workDays: true, breakDuration: true } as const;

function clockMinutes(time: string): number | null {
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
  const assignment = await prisma.employeeShift.findFirst({
    where: { employeeId: scope.employeeId, ...activeShiftWhere(now, scope.companyId) },
    orderBy: [{ effectiveFrom: 'desc' }, { id: 'asc' }],
    select: { shift: { select: scheduleFields } },
  });
  const shift = assignment?.shift ?? await prisma.shift.findFirst({
    where: { companyId: scope.companyId, isDefault: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: scheduleFields,
  });
  const previousDate = previousAttendanceDate(local.date);
  const end = overnightShiftEnd(shift);
  const previousWorkDay = previousDate.getUTCDay() || 7;
  const isOvernightTail = end !== null &&
    local.hour * 60 + local.minute < end &&
    shift?.workDays.includes(previousWorkDay);
  return { date: isOvernightTail ? previousDate : local.date, previousDate, shift };
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
        { date: dates.previousDate, checkInTime: { not: null }, checkOutTime: null },
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
