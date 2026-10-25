import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceService } from './attendance.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DataScopeService } from '../../common/services/data-scope.service';
import { MailService } from '../../common/mail/mail.service';
import { AttendanceGateway } from './attendance.gateway';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ConflictException, BadRequestException } from '@nestjs/common';
import { UserRole, AttendanceStatus, RemoteWorkStatus } from '@prisma/client';

describe('AttendanceService', () => {
  let service: AttendanceService;

  const mockPrisma: any = {
    employee: {
      findFirst: jest.fn(),
    },
    attendanceRecord: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    remoteWorkPermission: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    employeeShift: {
      findFirst: jest.fn(),
    },
    notification: {
      create: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
    },
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
      mockPrisma.attendanceRecord.findUnique.mockResolvedValueOnce({
        id: 'att-1',
        checkInTime: new Date(),
      });

      await expect(
        service.checkIn({ isRemote: false }, '127.0.0.1', mockEmployeeUser),
      ).rejects.toThrow(ConflictException);
    });

    it('should mark PRESENT for onsite check-in', async () => {
      mockPrisma.employee.findFirst.mockResolvedValueOnce({
        id: 'emp-1',
        companyId: 'comp-1',
      });
      mockPrisma.attendanceRecord.findUnique.mockResolvedValueOnce(null);
      mockPrisma.attendanceRecord.upsert.mockResolvedValueOnce({
        id: 'att-1',
        status: AttendanceStatus.PRESENT,
      });

      const result = await service.checkIn({ isRemote: false }, '192.168.1.5', mockEmployeeUser);
      expect(result.status).toBe(AttendanceStatus.PRESENT);
      expect(mockPrisma.attendanceRecord.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            status: AttendanceStatus.PRESENT,
            isRemote: false,
          }),
        }),
      );
    });

    it('should mark PRESENT_REMOTE when employee has standing remote work permission', async () => {
      mockPrisma.employee.findFirst.mockResolvedValueOnce({
        id: 'emp-1',
        companyId: 'comp-1',
      });
      mockPrisma.attendanceRecord.findUnique.mockResolvedValueOnce(null);
      mockPrisma.remoteWorkPermission.findFirst.mockResolvedValueOnce({
        id: 'perm-1',
        status: RemoteWorkStatus.APPROVED,
      });
      mockPrisma.attendanceRecord.upsert.mockResolvedValueOnce({
        id: 'att-remote',
        status: AttendanceStatus.PRESENT_REMOTE,
      });

      const result = await service.checkIn({ isRemote: true }, '10.0.0.1', mockEmployeeUser);
      expect(result.status).toBe(AttendanceStatus.PRESENT_REMOTE);
      expect(mockPrisma.attendanceRecord.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
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
      mockPrisma.attendanceRecord.findUnique.mockResolvedValueOnce(null);
      mockPrisma.remoteWorkPermission.findFirst.mockResolvedValueOnce(null); // No permission!
      mockPrisma.attendanceRecord.upsert.mockResolvedValueOnce({
        id: 'att-exception',
        status: AttendanceStatus.ABSENT_PENDING_REVIEW,
      });
      mockPrisma.user.findMany.mockResolvedValueOnce([{ id: 'hr-1', email: 'hr@acme.com' }]);
      mockPrisma.notification.create.mockResolvedValueOnce({});

      const result = await service.checkIn({ isRemote: true }, '172.16.0.4', mockEmployeeUser);
      expect(result.status).toBe(AttendanceStatus.ABSENT_PENDING_REVIEW);
      expect(mockGateway.broadcastAttendanceException).toHaveBeenCalled();
      expect(mockMailService.sendMail).toHaveBeenCalled();
    });
  });

  describe('checkOut', () => {
    it('should throw BadRequestException if checking out without check-in', async () => {
      mockPrisma.employee.findFirst.mockResolvedValueOnce({ id: 'emp-1', companyId: 'comp-1' });
      mockPrisma.attendanceRecord.findUnique.mockResolvedValueOnce(null);

      await expect(service.checkOut({}, mockEmployeeUser)).rejects.toThrow(BadRequestException);
    });

    it('should calculate work minutes and overtime on checkout', async () => {
      const checkInTime = new Date(Date.now() - 9 * 3600000); // 9 hours ago (540m)
      mockPrisma.employee.findFirst.mockResolvedValueOnce({ id: 'emp-1', companyId: 'comp-1' });
      mockPrisma.attendanceRecord.findUnique.mockResolvedValueOnce({
        id: 'att-1',
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
  });

  describe('resolveException', () => {
    it('should update status to PRESENT_REMOTE when HR approves exception', async () => {
      mockPrisma.attendanceRecord.findFirst.mockResolvedValueOnce({
        id: 'att-ex',
        date: new Date(),
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
        mockEmployeeUser,
      );

      expect(result.status).toBe(AttendanceStatus.PRESENT_REMOTE);
      expect(mockPrisma.notification.create).toHaveBeenCalled();
    });
  });
});
