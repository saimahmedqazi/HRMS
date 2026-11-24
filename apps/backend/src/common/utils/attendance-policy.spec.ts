import { AttendanceStatus } from '@prisma/client';
import { classifyWork, missingCheckoutDue, netWorkMinutes, punchPolicy, validPolicyDurations } from './attendance-policy';
import { attendanceDayStart } from './attendance-date';

const date = new Date('2026-11-24');
const policy = { ...punchPolicy(null, date, 'Asia/Karachi'), breakDuration: 60, requiredMinutes: 420, halfDayMinutes: 240, fullDayMinutes: 420 };

describe('attendance policy', () => {
  it.each([
    [0, AttendanceStatus.ABSENT, 0],
    [2, AttendanceStatus.ABSENT, 0],
    [180, AttendanceStatus.ABSENT, 0],
    [240, AttendanceStatus.HALF_DAY, 0],
    [360, AttendanceStatus.HALF_DAY, 0],
    [420, AttendanceStatus.PRESENT, 0],
    [480, AttendanceStatus.PRESENT, 60],
  ])('classifies %s net minutes', (minutes, status, overtimeMinutes) => {
    expect(classifyWork(minutes, policy, false)).toEqual({ status, overtimeMinutes });
  });

  it('deducts a scheduled break only for punch-based time', () => {
    expect(netWorkMinutes(480 * 60000, policy)).toBe(420);
    expect(netWorkMinutes(480 * 60000, policy, 420)).toBe(420);
    expect(netWorkMinutes(480 * 60000, policy, 0)).toBe(0);
    expect(netWorkMinutes(2 * 60000, policy)).toBe(0);
  });

  it('separates remote work, partial attendance and overtime eligibility', () => {
    expect(classifyWork(240, policy, true).status).toBe(AttendanceStatus.HALF_DAY);
    expect(classifyWork(480, { ...policy, overtimeCapMinutes: 30 }, true)).toEqual({ status: AttendanceStatus.PRESENT_REMOTE, overtimeMinutes: 30 });
    expect(classifyWork(480, { ...policy, overtimeEnabled: false }, true).overtimeMinutes).toBe(0);
    expect(classifyWork(0, { ...policy, scheduled: false }, true).status).toBe(AttendanceStatus.WEEKEND);
  });

  it('validates durations and rejects contradictory thresholds and overtime options', () => {
    const rules = { ...policy, startTime: '22:00', endTime: '06:00' };
    expect(validPolicyDurations(rules)).toBe(true);
    expect(validPolicyDurations({ ...rules, halfDayMinutes: 421 })).toBe(false);
    expect(validPolicyDurations({ ...rules, breakDuration: 61 })).toBe(false);
    expect(validPolicyDurations({ ...rules, endTime: '22:00' })).toBe(false);
    expect(validPolicyDurations({ ...rules, overtimeEnabled: false, overtimeCapMinutes: 30 })).toBe(false);
  });

  it('uses the overnight cutoff in the policy timezone and resolves local day boundaries', () => {
    const overnight = { ...policy, overnightEnd: 360 };
    expect(missingCheckoutDue(date, overnight, new Date('2026-11-25T00:59:00Z'))).toBe(false);
    expect(missingCheckoutDue(date, overnight, new Date('2026-11-25T01:00:00Z'))).toBe(true);
    expect(attendanceDayStart(date, 'Asia/Kathmandu').toISOString()).toBe('2026-11-23T18:15:00.000Z');
  });
});
