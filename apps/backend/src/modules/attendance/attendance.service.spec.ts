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
    workTimerEntry: { findFirst: jest.fn().mockResolvedValue(null) },
    remoteWorkPermission: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    employeeShift: {
      findFirst: jest.fn(),
    },
    shift: { findFirst: jest.fn().mockResolvedValue(null) },
    notification: {
      create: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
    },
    ipWhitelist: { findMany: jest.fn().mockResolvedValue([]) },
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

    it('should mark PRESENT for onsite check-in', async () => {
      mockPrisma.employee.findFirst.mockResolvedValueOnce({
        id: 'emp-1',
        companyId: 'comp-1',
      });
      mockPrisma.attendanceRecord.update.mockResolvedValueOnce({
        id: 'att-1',
        status: AttendanceStatus.PRESENT,
      });

      const result = await service.checkIn({ isRemote: false }, '192.168.1.5', mockEmployeeUser);
      expect(result.status).toBe(AttendanceStatus.PRESENT);
      expect(mockPrisma.attendanceRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: AttendanceStatus.PRESENT,
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

    it('should mark PRESENT_REMOTE when employee has standing remote work permission', async () => {
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
        status: AttendanceStatus.PRESENT_REMOTE,
      });

      const result = await service.checkIn({ isRemote: true }, '10.0.0.1', mockEmployeeUser);
      expect(result.status).toBe(AttendanceStatus.PRESENT_REMOTE);
      expect(mockPrisma.attendanceRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: AttendanceStatus.PRESENT_REMOTE,
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
      mockPrisma.user.findMany.mockResolvedValueOnce([{ id: 'hr-1', email: 'hr@acme.com' }]);
      mockPrisma.notification.create.mockResolvedValueOnce({});

      const result = await service.checkIn({ isRemote: true }, '127.0.0.1', mockEmployeeUser);
      expect(result.status).toBe(AttendanceStatus.ABSENT_PENDING_REVIEW);
      expect(mockPrisma.attendanceRecord.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ checkInIp: '127.0.0.1', status: AttendanceStatus.ABSENT_PENDING_REVIEW }),
      }));
      expect(mockGateway.broadcastAttendanceException).toHaveBeenCalled();
      expect(mockMailService.sendMail).toHaveBeenCalled();
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
        data: expect.objectContaining({ workMinutes: 390, overtimeMinutes: 30 }),
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
