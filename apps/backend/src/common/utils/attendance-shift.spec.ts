import { getAttendanceDay } from './attendance-date';
import { resolveEmployeeAttendanceDay, shiftStandardMinutes } from './attendance-shift';

describe('employee attendance day', () => {
  const shift = { startTime: '22:30', endTime: '05:30', workDays: [2], breakDuration: 30 };
  const scope = { companyId: 'company-1', employeeId: 'employee-1' };
  const prisma = {
    employeeShift: { findFirst: jest.fn().mockResolvedValue({ shift }) },
    shift: { findFirst: jest.fn().mockResolvedValue(null) },
  } as unknown as Parameters<typeof resolveEmployeeAttendanceDay>[0];

  it('uses the scheduled previous work day until the local cutoff', async () => {
    const before = new Date('2026-11-11T00:29:00Z');
    const end = new Date('2026-11-11T00:30:00Z');
    const followingNight = new Date('2026-11-11T20:15:00Z');
    const dateFor = (now: Date) => resolveEmployeeAttendanceDay(
      prisma, scope, now, getAttendanceDay(now, 'Asia/Karachi'),
    );
    expect((await dateFor(before)).date).toEqual(new Date('2026-11-10'));
    expect((await dateFor(end)).date).toEqual(new Date('2026-11-11'));
    expect((await dateFor(followingNight)).date).toEqual(new Date('2026-11-12'));
  });

  it('calculates the scheduled duration across midnight and handles an invalid schedule', () => {
    expect(shiftStandardMinutes(shift)).toBe(420);
    expect(shiftStandardMinutes({ ...shift, startTime: 'invalid' })).toBe(480);
  });
});
