import { AttendanceStatus } from '@prisma/client';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { AttendanceCronService } from './attendance.cron';

describe('AttendanceCronService', () => {
  const day = { startTime: '09:00', endTime: '17:00', workDays: [2], breakDuration: 60, isDefault: true };
  const night = { startTime: '22:00', endTime: '06:00', workDays: [2], breakDuration: 30, isDefault: false };
  const date = new Date('2026-11-10');
  const companyId = 'company-1';
  const db = {
    company: { findMany: jest.fn().mockResolvedValue([{ id: companyId, timezone: 'Asia/Kathmandu', shifts: [day, night] }]) },
    employee: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'day', shifts: [] },
        { id: 'night', shifts: [{ shift: night }] },
        { id: 'punched', shifts: [{ shift: night }] },
      ]),
    },
    attendanceRecord: {
      findUnique: jest.fn().mockImplementation(async ({ where }) =>
        where.companyId_employeeId_date.employeeId === 'punched' ? { checkInTime: new Date() } : null),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    leaveRequest: { findFirst: jest.fn().mockResolvedValue(null) },
    remoteWorkPermission: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const service = new AttendanceCronService(db as unknown as PrismaService);

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => jest.useRealTimers());

  it('marks daytime absences at midnight and defers overnight absences until the shift ends', async () => {
    jest.setSystemTime(new Date('2026-11-10T19:00:00Z')); // 00:45 in Kathmandu
    await service.handleNightlyAbsenceJob();
    expect(db.attendanceRecord.createMany).toHaveBeenCalledTimes(1);
    expect(db.attendanceRecord.createMany).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ companyId, employeeId: 'day', date, status: AttendanceStatus.ABSENT }),
      skipDuplicates: true,
    });

    jest.setSystemTime(new Date('2026-11-11T01:00:00Z')); // 06:45 in Kathmandu
    await service.handleNightlyAbsenceJob();
    expect(db.attendanceRecord.createMany).toHaveBeenCalledTimes(2);
    expect(db.attendanceRecord.createMany).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ companyId, employeeId: 'night', date, status: AttendanceStatus.ABSENT }),
      skipDuplicates: true,
    });
    expect(db.attendanceRecord.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({ companyId, employeeId: 'night', date, checkInTime: null }),
    }));
  });
});
