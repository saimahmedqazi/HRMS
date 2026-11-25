import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceService } from './attendance.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DataScopeService } from '../../common/services/data-scope.service';
import { MailService } from '../../common/mail/mail.service';
import { AttendanceGateway } from './attendance.gateway';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ConflictException, BadRequestException } from '@nestjs/common';
import { UserRole, AttendanceStatus, Prisma, RemoteWorkStatus } from '@prisma/client';

describe('AttendanceService', () => {
  let service: AttendanceService;

  const mockPrisma: any = {
    company: { findUnique: jest.fn().mockResolvedValue({ timezone: 'UTC' }) },
    employee: {
      findFirst: jest.fn(),
    },
    attendanceRecord: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
    },
    workTimer: { findFirst: jest.fn().mockResolvedValue(null) },
    workTimerEntry: { findFirst: jest.fn().mockResolvedValue(null) },
    remoteWorkPermission: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    employeeShift: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
    },
    shift: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
    },
    shiftRevision: { createMany: jest.fn() },
    notification: {
      create: jest.fn(),
      createMany: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
    },
    ipWhitelist: { findMany: jest.fn().mockResolvedValue([]) },
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    $transaction: jest.fn((callback) => callback(mockPrisma)),
  };

  const mockMailService = {
    sendMail: jest.fn().mockResolvedValue(true),
  };

  const mockGateway = {
    broadcastAttendanceException: jest.fn(),
    broadcastBreakAlert: jest.fn(),
  };

  const mockEmployeeUser: AuthenticatedUser = {
    id: 'user-emp-1',
    email: 'evan@acme.com',
    role: UserRole.EMPLOYEE,
    companyId: 'comp-1',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        DataScopeService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MailService, useValue: mockMailService },
        { provide: AttendanceGateway, useValue: mockGateway },
      ],
    }).compile();

    service = module.get<AttendanceService>(AttendanceService);
    jest.clearAllMocks();
  });

  describe('createRemotePermission', () => {
    it.each([
      ['2026-02-30', '2026-03-02', 'Fixture', 'valid start and end dates'],
      ['2026-03-02', 'invalid', 'Fixture', 'valid start and end dates'],
      ['2026-03-02T00:00:00Z', '2026-03-02', 'Fixture', 'valid start and end dates'],
      ['2026-03-02', '2026-03-01', 'Fixture', 'earlier than start date'],
      ['2026-03-02', '2026-03-02', '   ', 'Enter a reason'],
    ])('rejects invalid input before writing (%s, %s)', async (startDate, endDate, reason, error) => {
      await expect(service.createRemotePermission({ startDate, endDate, reason }, mockEmployeeUser)).rejects.toThrow(error);
      expect(mockPrisma.remoteWorkPermission.create).not.toHaveBeenCalled();
    });

    it('stores a same-day request at UTC midnight', async () => {
      mockPrisma.employee.findFirst.mockResolvedValueOnce({ id: 'emp-1' });
      await service.createRemotePermission({ startDate: '2028-02-29', endDate: '2028-02-29', reason: ' Fixture ' }, mockEmployeeUser);
      expect(mockPrisma.remoteWorkPermission.create).toHaveBeenCalledWith({ data: {
        companyId: 'comp-1', employeeId: 'emp-1', startDate: new Date('2028-02-29'),
        endDate: new Date('2028-02-29'), reason: 'Fixture', status: RemoteWorkStatus.PENDING,
      } });
    });
  });

  describe('shift policy access', () => {
    const dto = { effectiveDate: '2099-01-01', startTime: '09:00', endTime: '17:00', workDays: [1, 2, 3, 4, 5],
      breakDuration: 60, requiredMinutes: 420, halfDayMinutes: 240, fullDayMinutes: 420, overtimeEnabled: true };
    it.each([UserRole.HR_MANAGER, UserRole.EMPLOYEE, UserRole.SUPER_ADMIN])('denies policy writes by %s', async (role) => {
      await expect(service.scheduleShiftPolicy(dto, { ...mockEmployeeUser, role })).rejects.toThrow('Only the company CEO');
    });
    it('creates a prospective revision without updating attendance or replacing an assignment', async () => {
      const ceo = { ...mockEmployeeUser, role: UserRole.COMPANY_ADMIN };
      mockPrisma.shift.findFirst.mockResolvedValueOnce({ id: 'shift-1' });
      mockPrisma.shiftRevision.createMany.mockResolvedValueOnce({ count: 1 });
      await expect(service.scheduleShiftPolicy(dto, ceo, 'shift-1')).resolves.toEqual({
        shiftId: 'shift-1', effectiveDate: new Date('2099-01-01'),
      });
      expect(mockPrisma.shiftRevision.createMany).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ companyId: ceo.companyId, shiftId: 'shift-1', halfDayMinutes: 240 }),
      }));
      expect(mockPrisma.attendanceRecord.update).not.toHaveBeenCalled();
      expect(mockPrisma.employeeShift.findFirst).not.toHaveBeenCalled();
    });
    it('scopes revisions to the CEO tenant and does not mutate the existing shift', async () => {
      const ceo = { ...mockEmployeeUser, role: UserRole.COMPANY_ADMIN };
      mockPrisma.shift.findFirst.mockResolvedValueOnce(null);
      await expect(service.scheduleShiftPolicy(dto, ceo, 'foreign')).rejects.toThrow('Shift not found');
      expect(mockPrisma.shift.findFirst).toHaveBeenCalledWith({ where: { id: 'foreign', companyId: ceo.companyId } });
    });
    it('rejects duplicate shift names within the same tenant (case and whitespace insensitive)', async () => {
      const ceo = { ...mockEmployeeUser, role: UserRole.COMPANY_ADMIN };
      mockPrisma.shift.findMany.mockResolvedValueOnce([{ id: 's-1', name: 'Standard Day Shift' }]);
      await expect(
        service.scheduleShiftPolicy({ ...dto, name: '  standard day shift  ' }, ceo),
      ).rejects.toThrow(ConflictException);
      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    });
  });

  describe('HR-16 shift assignment effective dates & visibility', () => {
    const hrUser = { ...mockEmployeeUser, id: 'hr-1', role: UserRole.HR_MANAGER };

    it('rejects shift assignment by non-CEO/HR roles', async () => {
      await expect(service.assignShift('shift-1', 'emp-1', mockEmployeeUser)).rejects.toThrow('Only authorized CEO or HR');
    });

    it('rejects retroactive past effective dates', async () => {
      await expect(
        service.assignShift('shift-1', 'emp-1', hrUser, { effectiveDate: '2020-01-01' }),
      ).rejects.toThrow('retroactively');
    });

    it('rejects same-day assignment when attendance or active overnight punch exists', async () => {
      const todayStr = new Date().toISOString().slice(0, 10);
      mockPrisma.employee.findFirst.mockResolvedValueOnce({ id: 'emp-1', userId: 'u-emp-1', firstName: 'Evan', lastName: 'Wright' });
      mockPrisma.shift.findFirst.mockResolvedValueOnce({ id: 'shift-1', name: 'Night Shift', isDefault: false, revisions: [] });
      mockPrisma.attendanceRecord.findFirst
        .mockResolvedValueOnce({ id: 'att-today' })
        .mockResolvedValueOnce(null);
      mockPrisma.workTimerEntry.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.assignShift('shift-1', 'emp-1', hrUser, { effectiveDate: todayStr }),
      ).rejects.toThrow('already has attendance activity');
    });

    it('inserts an assignment between existing future assignments without deleting unrelated ones and notifies once', async () => {
      mockPrisma.employee.findFirst.mockResolvedValueOnce({ id: 'emp-1', userId: 'u-emp-1', firstName: 'Evan', lastName: 'Wright' });
      mockPrisma.shift.findFirst.mockResolvedValueOnce({
        id: 'shift-mid',
        name: 'Mid Shift',
        isDefault: false,
        revisions: [{ effectiveDate: new Date('2099-01-01') }],
      });
      const prevFrom = new Date('2099-01-02T00:00:00.000Z');
      const nextFrom = new Date('2099-01-20T00:00:00.000Z');
      mockPrisma.employeeShift.findMany.mockResolvedValueOnce([
        { id: 'es-1', shiftId: 'shift-a', effectiveFrom: prevFrom, effectiveTo: null },
        { id: 'es-2', shiftId: 'shift-b', effectiveFrom: nextFrom, effectiveTo: null },
      ]);
      mockPrisma.employeeShift.create.mockResolvedValueOnce({ id: 'es-mid', shiftId: 'shift-mid' });

      await service.assignShift('shift-mid', 'emp-1', hrUser, { effectiveDate: '2099-01-10' });

      expect(mockPrisma.employeeShift.update).toHaveBeenCalledWith({
        where: { id: 'es-1' },
        data: { effectiveTo: new Date(new Date('2099-01-10T00:00:00.000Z').getTime() - 1) },
      });
      expect(mockPrisma.employeeShift.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          shiftId: 'shift-mid',
          effectiveFrom: new Date('2099-01-10T00:00:00.000Z'),
          effectiveTo: new Date(nextFrom.getTime() - 1),
        }),
      });
      expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1);
    });

    it('returns idempotently without duplicate notification when identical assignment is repeated', async () => {
      const targetFrom = new Date('2099-02-01T00:00:00.000Z');
      mockPrisma.employee.findFirst.mockResolvedValueOnce({ id: 'emp-1', userId: 'u-emp-1', firstName: 'Evan', lastName: 'Wright' });
      mockPrisma.shift.findFirst.mockResolvedValueOnce({ id: 'shift-1', name: 'Day Shift', isDefault: true, revisions: [] });
      mockPrisma.employeeShift.findMany.mockResolvedValueOnce([
        { id: 'es-1', shiftId: 'shift-1', effectiveFrom: targetFrom, effectiveTo: null },
      ]);

      const res = await service.assignShift('shift-1', 'emp-1', hrUser, { effectiveDate: '2099-02-01' });
      expect((res as { idempotent?: boolean }).idempotent).toBe(true);
      expect(mockPrisma.employeeShift.create).not.toHaveBeenCalled();
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });
  });

  describe('checkIn', () => {
    it('should throw ConflictException if already checked in today', async () => {
      mockPrisma.employee.findFirst.mockResolvedValueOnce({
        id: 'emp-1',
        companyId: 'comp-1',
      });
      mockPrisma.attendanceRecord.update.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Record not found', { code: 'P2025', clientVersion: 'test' }),
      );

      await expect(
        service.checkIn({ isRemote: false }, '127.0.0.1', mockEmployeeUser),
      ).rejects.toThrow(ConflictException);
    });

    it('should mark IN_PROGRESS for onsite check-in', async () => {
      mockPrisma.employee.findFirst.mockResolvedValueOnce({
        id: 'emp-1',
        companyId: 'comp-1',
      });
      mockPrisma.attendanceRecord.update.mockResolvedValueOnce({
        id: 'att-1',
        status: AttendanceStatus.IN_PROGRESS,
      });

      const result = await service.checkIn({ isRemote: false }, '192.168.1.5', mockEmployeeUser);
      expect(result.status).toBe(AttendanceStatus.IN_PROGRESS);
      expect(mockPrisma.attendanceRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: AttendanceStatus.IN_PROGRESS,
            isRemote: false,
          }),
        }),
      );
    });

    it.each([false, true])('stores device coordinates only with current consent (%s)', async (locationConsent) => {
      mockPrisma.employee.findFirst
        .mockResolvedValueOnce({ id: 'emp-1', locationConsent: true })
        .mockResolvedValueOnce({ locationConsent });
      mockPrisma.attendanceRecord.update.mockResolvedValueOnce({ id: 'att-1' });

      await service.checkIn({ isRemote: false, latitude: 0, longitude: 45 }, '127.0.0.1', mockEmployeeUser);

      expect(mockPrisma.employee.findFirst).toHaveBeenLastCalledWith({
        where: { id: 'emp-1', companyId: 'comp-1', userId: 'user-emp-1', deletedAt: null },
        select: { locationConsent: true },
      });
      expect(mockPrisma.attendanceRecord.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          checkInLocation: locationConsent ? JSON.stringify({ lat: 0, lng: 45, whitelisted: false }) : null,
        }),
      }));
    });

    it('should mark IN_PROGRESS remotely when employee has standing remote work permission', async () => {
      mockPrisma.employee.findFirst.mockResolvedValueOnce({
        id: 'emp-1',
        companyId: 'comp-1',
      });
      mockPrisma.remoteWorkPermission.findFirst.mockResolvedValueOnce({
        id: 'perm-1',
        status: RemoteWorkStatus.APPROVED,
      });
      mockPrisma.attendanceRecord.update.mockResolvedValueOnce({
        id: 'att-remote',
        status: AttendanceStatus.IN_PROGRESS,
      });

      const result = await service.checkIn({ isRemote: true }, '10.0.0.1', mockEmployeeUser);
      expect(result.status).toBe(AttendanceStatus.IN_PROGRESS);
      expect(mockPrisma.attendanceRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: AttendanceStatus.IN_PROGRESS,
            isRemote: true,
          }),
        }),
      );
    });

    it('should route unauthorized remote check-in to HR Exceptions Queue (ABSENT_PENDING_REVIEW)', async () => {
      mockPrisma.employee.findFirst.mockResolvedValueOnce({
        id: 'emp-1',
        firstName: 'Evan',
        lastName: 'Wright',
        employeeCode: 'EMP-005',
        companyId: 'comp-1',
      });
      mockPrisma.remoteWorkPermission.findFirst.mockResolvedValueOnce(null); // No permission!
      mockPrisma.attendanceRecord.update.mockResolvedValueOnce({
        id: 'att-exception',
        status: AttendanceStatus.ABSENT_PENDING_REVIEW,
      });
      mockPrisma.user.findMany.mockResolvedValueOnce([
        { id: 'hr-1', email: 'hr1@example.test' },
        { id: 'hr-2', email: 'hr2@example.test' },
      ]);
      mockPrisma.notification.createMany.mockResolvedValueOnce({ count: 2 });
      mockMailService.sendMail.mockRejectedValueOnce(new Error('Mail unavailable'));

      const result = await service.checkIn({ isRemote: true }, '127.0.0.1', mockEmployeeUser);
      expect(result.status).toBe(AttendanceStatus.ABSENT_PENDING_REVIEW);
      expect(mockPrisma.attendanceRecord.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ checkInIp: '127.0.0.1', status: AttendanceStatus.ABSENT_PENDING_REVIEW }),
      }));
      expect(mockGateway.broadcastAttendanceException).toHaveBeenCalled();
      expect(mockPrisma.notification.createMany).toHaveBeenCalledWith({ data: ['hr-1', 'hr-2'].map((userId) => expect.objectContaining({
        companyId: 'comp-1', userId, type: 'ATTENDANCE_EXCEPTION', data: { attendanceId: 'att-exception', employeeId: 'emp-1' },
      })) });
      expect(mockMailService.sendMail).toHaveBeenCalledTimes(2);
      expect(mockPrisma.notification.createMany.mock.invocationCallOrder[0])
        .toBeLessThan(mockGateway.broadcastAttendanceException.mock.invocationCallOrder[0]);
    });
  });

  describe('checkOut', () => {
    it('should throw BadRequestException if checking out without check-in', async () => {
      mockPrisma.employee.findFirst.mockResolvedValueOnce({ id: 'emp-1', companyId: 'comp-1' });
      mockPrisma.attendanceRecord.findFirst.mockResolvedValueOnce(null);

      await expect(service.checkOut({}, mockEmployeeUser)).rejects.toThrow(BadRequestException);
    });

    it('should calculate work minutes and overtime on checkout', async () => {
      const checkInTime = new Date(Date.now() - 9 * 3600000); // 9 hours ago (540m)
      mockPrisma.employee.findFirst.mockResolvedValueOnce({ id: 'emp-1', companyId: 'comp-1' });
      mockPrisma.attendanceRecord.findFirst.mockResolvedValueOnce({
        id: 'att-1',
        date: new Date(),
        checkInTime,
        checkOutTime: null,
      });
      mockPrisma.employeeShift.findFirst.mockResolvedValueOnce(null); // defaults to 480m
      mockPrisma.attendanceRecord.update.mockResolvedValueOnce({
        id: 'att-1',
        workMinutes: 540,
        overtimeMinutes: 60, // 540 - 480 = 60m overtime
      });

      const result = await service.checkOut({}, mockEmployeeUser);
      expect(result.overtimeMinutes).toBe(60);
      expect(result.workMinutes).toBe(540);
    });

    it('uses the original shift date for completed timer totals', async () => {
      const date = new Date('2026-11-10');
      mockPrisma.employee.findFirst.mockResolvedValueOnce({ id: 'emp-1' });
      mockPrisma.attendanceRecord.findFirst.mockResolvedValueOnce({
        id: 'night-punch', date, checkInTime: new Date(), checkOutTime: null,
      });
      mockPrisma.employeeShift.findFirst.mockResolvedValueOnce({
        shift: { startTime: '22:00', endTime: '04:00', workDays: [1, 2, 3, 4, 5], breakDuration: 30 },
      });
      mockPrisma.workTimerEntry.findFirst.mockResolvedValueOnce({ totalMinutes: 390 });
      mockPrisma.attendanceRecord.update.mockResolvedValueOnce({});

      await service.checkOut({}, mockEmployeeUser);

      expect(mockPrisma.workTimerEntry.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ date }),
      }));
      expect(mockPrisma.attendanceRecord.update).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ id: 'night-punch' }),
        data: expect.objectContaining({ workMinutes: 390, overtimeMinutes: 60 }),
      }));
    });
  });

  describe('resolveException', () => {
    const reviewer = { ...mockEmployeeUser, id: 'hr-1', role: UserRole.HR_MANAGER };

    it('should update status to PRESENT_REMOTE when HR approves exception', async () => {
      mockPrisma.attendanceRecord.findFirst.mockResolvedValueOnce({
        id: 'att-ex',
        date: new Date(),
        status: AttendanceStatus.ABSENT_PENDING_REVIEW,
        employee: { userId: 'user-1' },
      });
      mockPrisma.attendanceRecord.update.mockResolvedValueOnce({
        id: 'att-ex',
        status: AttendanceStatus.PRESENT_REMOTE,
      });
      mockPrisma.notification.create.mockResolvedValueOnce({});

      const result = await service.resolveException(
        'att-ex',
        { action: 'APPROVE', notes: 'Verified with team lead' },
        reviewer,
      );

      expect(result.status).toBe(AttendanceStatus.PRESENT_REMOTE);
      expect(mockPrisma.attendanceRecord.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'att-ex', companyId: 'comp-1', status: AttendanceStatus.ABSENT_PENDING_REVIEW },
      }));
      expect(mockPrisma.notification.create).toHaveBeenCalled();
    });

    it('does not resolve a normal punch', async () => {
      mockPrisma.attendanceRecord.findFirst.mockResolvedValueOnce({ status: AttendanceStatus.PRESENT });

      await expect(service.resolveException('att-ex', { action: 'REJECT' }, reviewer)).rejects.toThrow(ConflictException);
      expect(mockPrisma.attendanceRecord.update).not.toHaveBeenCalled();
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });

    it('reports a concurrent resolution without notifying again', async () => {
      mockPrisma.attendanceRecord.findFirst.mockResolvedValueOnce({
        id: 'att-ex', status: AttendanceStatus.ABSENT_PENDING_REVIEW,
      });
      mockPrisma.attendanceRecord.update.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError(
        'Record changed', { code: 'P2025', clientVersion: 'test' },
      ));

      await expect(service.resolveException('att-ex', { action: 'REJECT' }, reviewer)).rejects.toThrow(ConflictException);
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });
  });

  it.each(['approvePermissionStep1', 'approvePermissionStep2'] as const)('reports concurrent decisions in %s', async (method) => {
    mockPrisma.remoteWorkPermission.findFirst.mockResolvedValueOnce({
      status: RemoteWorkStatus.PENDING,
      step1ApprovedAt: method === 'approvePermissionStep1' ? null : new Date(),
      employee: { userId: 'user-emp-1' },
    });
    mockPrisma.remoteWorkPermission.update.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError(
      'Record changed', { code: 'P2025', clientVersion: 'test' },
    ));

    await expect(service[method]('remote-1', {
      ...mockEmployeeUser, id: 'hr-1', role: UserRole.HR_MANAGER,
    })).rejects.toThrow(ConflictException);
  });

  describe('listAttendanceRecords (Data Scope Enforcement)', () => {
    it.each([
      { startDate: '2026-02-30' }, { endDate: 'invalid' },
      { startDate: '2026-11-03', endDate: '2026-11-02' },
    ])('rejects invalid date filters before querying attendance %j', async (filter) => {
      await expect(service.listAttendanceRecords(mockEmployeeUser, filter)).rejects.toBeInstanceOf(BadRequestException);
      expect(mockPrisma.attendanceRecord.findMany).not.toHaveBeenCalled();
    });

    it('queries the same UTC calendar day at both inclusive bounds', async () => {
      mockPrisma.employee.findFirst.mockResolvedValueOnce({ id: 'emp-self-1' });
      await service.listAttendanceRecords(mockEmployeeUser, { startDate: '2026-11-03', endDate: '2026-11-03' });
      expect(mockPrisma.attendanceRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ date: { gte: new Date('2026-11-03'), lte: new Date('2026-11-03') } }),
      }));
    });

    it('should prevent EMPLOYEE from overriding SELF scope via filter.employeeId', async () => {
      mockPrisma.employee.findFirst.mockResolvedValueOnce({
        id: 'emp-self-1',
        departmentId: 'dept-1',
        teamId: 'team-1',
      });
      mockPrisma.attendanceRecord.findMany.mockResolvedValueOnce([]);

      await service.listAttendanceRecords(mockEmployeeUser, {
        employeeId: 'emp-other-999',
      });

      expect(mockPrisma.attendanceRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: 'comp-1',
            employeeId: 'emp-self-1',
          }),
        }),
      );
    });
  });
});
