import 'multer';
import { Test, TestingModule } from '@nestjs/testing';
import { EmployeesService } from './employees.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DataScopeService } from '../../common/services/data-scope.service';
import { MailService } from '../../common/mail/mail.service';
import { StorageService } from '../../common/storage/storage.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ConflictException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserRole, EmployeeStatus, AuditAction } from '@prisma/client';

describe('EmployeesService', () => {
  let service: EmployeesService;

  const mockPrisma: any = {
    employee: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    department: {
      findFirst: jest.fn(),
    },
    designation: {
      findFirst: jest.fn(),
    },
    team: {
      findFirst: jest.fn(),
    },
    shift: {
      findFirst: jest.fn(),
    },
    employeeShift: {
      create: jest.fn(),
    },
    leaveTypeSetting: {
      findMany: jest.fn(),
    },
    leaveBalance: {
      createMany: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    notification: {
      create: jest.fn(),
    },
    employeeDocument: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn((callback: any): any => callback(mockPrisma)),
  };

  const mockMailService = {
    sendMail: jest.fn().mockResolvedValue(true),
  };

  const mockStorageService = {
    uploadFile: jest.fn().mockResolvedValue({
      url: 'https://res.cloudinary.com/zenhr/image/upload/avatar-1.png',
      publicId: 'zenhr/avatars/avatar-1',
      size: 1024,
    }),
  };

  const mockAdminUser: AuthenticatedUser = {
    id: 'user-admin',
    email: 'hr@acme.com',
    role: UserRole.HR_MANAGER,
    companyId: 'comp-1',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmployeesService,
        DataScopeService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MailService, useValue: mockMailService },
        { provide: StorageService, useValue: mockStorageService },
      ],
    }).compile();

    service = module.get<EmployeesService>(EmployeesService);
    jest.clearAllMocks();
  });

  describe('onboardEmployee', () => {
    it('should throw ConflictException if email is already taken', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'existing-user' });

      await expect(
        service.onboardEmployee(
          {
            firstName: 'Sarah',
            lastName: 'Connor',
            email: 'existing@acme.com',
          },
          mockAdminUser,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should onboard employee, create user, default shift, and leave balances', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);
      mockPrisma.employee.count.mockResolvedValueOnce(5);
      mockPrisma.user.create.mockResolvedValueOnce({
        id: 'new-user-id',
        email: 'sarah@acme.com',
        role: UserRole.EMPLOYEE,
      });
      mockPrisma.employee.create.mockResolvedValueOnce({
        id: 'new-emp-id',
        employeeCode: 'EMP-006',
        firstName: 'Sarah',
        lastName: 'Connor',
        status: EmployeeStatus.ON_PROBATION,
      });
      mockPrisma.shift.findFirst.mockResolvedValueOnce({ id: 'default-shift' });
      mockPrisma.employeeShift.create.mockResolvedValueOnce({});
      mockPrisma.leaveTypeSetting.findMany.mockResolvedValueOnce([
        { id: 'lt-1', annualAllocation: 10 },
      ]);
      mockPrisma.leaveBalance.createMany.mockResolvedValueOnce({ count: 1 });

      const result = await service.onboardEmployee(
        {
          firstName: 'Sarah',
          lastName: 'Connor',
          email: 'sarah@acme.com',
        },
        mockAdminUser,
      );

      expect(result.employeeCode).toBe('EMP-006');
      expect(result.status).toBe(EmployeeStatus.ON_PROBATION);
      expect(mockPrisma.employee.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            employeeCode: 'EMP-006',
            firstName: 'Sarah',
            status: EmployeeStatus.ON_PROBATION,
          }),
        }),
      );
      expect(mockMailService.sendMail).toHaveBeenCalled();
    });
  });

  describe('updateStatus', () => {
    it('should update status, write audit log, create notification, and send email', async () => {
      mockPrisma.employee.findFirst.mockResolvedValueOnce({
        id: 'emp-1',
        employeeCode: 'EMP-001',
        firstName: 'Arthur',
        lastName: 'Pendelton',
        status: EmployeeStatus.ON_PROBATION,
        userId: 'user-1',
        user: { email: 'arthur@acme.com' },
        reportingManager: null,
      });
      mockPrisma.employee.update.mockResolvedValueOnce({
        id: 'emp-1',
        status: EmployeeStatus.ACTIVE,
      });
      mockPrisma.auditLog.create.mockResolvedValueOnce({});
      mockPrisma.notification.create.mockResolvedValueOnce({});

      const result = await service.updateStatus(
        'emp-1',
        { status: EmployeeStatus.ACTIVE, reason: 'Completed probation review' },
        mockAdminUser,
      );

      expect(result.status).toBe(EmployeeStatus.ACTIVE);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: AuditAction.STATUS_CHANGE,
            entity: 'Employee',
            entityId: 'emp-1',
          }),
        }),
      );
      expect(mockPrisma.notification.create).toHaveBeenCalled();
      expect(mockMailService.sendMail).toHaveBeenCalled();
    });

    it('should lock user account when status changes to SUSPENDED', async () => {
      mockPrisma.employee.findFirst.mockResolvedValueOnce({
        id: 'emp-1',
        employeeCode: 'EMP-001',
        firstName: 'Arthur',
        lastName: 'Pendelton',
        status: EmployeeStatus.ACTIVE,
        userId: 'user-1',
        user: { email: 'arthur@acme.com' },
        reportingManager: null,
      });
      mockPrisma.employee.update.mockResolvedValueOnce({
        id: 'emp-1',
        status: EmployeeStatus.SUSPENDED,
      });
      mockPrisma.auditLog.create.mockResolvedValueOnce({});
      mockPrisma.notification.create.mockResolvedValueOnce({});
      mockPrisma.user.update.mockResolvedValueOnce({});

      await service.updateStatus(
        'emp-1',
        { status: EmployeeStatus.SUSPENDED, reason: 'Security investigation' },
        mockAdminUser,
      );

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({
            lockedUntil: expect.any(Date),
            refreshTokenHash: null,
          }),
        }),
      );
    });
  });

  describe('updateEmployee', () => {
    it('should prevent employee from selecting themselves as their reporting manager', async () => {
      mockPrisma.employee.findFirst.mockResolvedValueOnce({
        id: 'emp-1',
        companyId: 'comp-1',
      });

      await expect(
        service.updateEmployee('emp-1', { reportingManagerId: 'emp-1' }, mockAdminUser),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('uploadAvatar', () => {
    it('should upload image through storage service and update employee record', async () => {
      mockPrisma.employee.findFirst.mockResolvedValueOnce({
        id: 'emp-1',
        companyId: 'comp-1',
        userId: 'user-1',
      });
      mockPrisma.employee.update.mockResolvedValueOnce({
        id: 'emp-1',
        profilePictureUrl: 'https://res.cloudinary.com/zenhr/image/upload/avatar-1.png',
      });

      const mockFile = {
        fieldname: 'file',
        originalname: 'photo.jpg',
        mimetype: 'image/jpeg',
        size: 512,
        buffer: Buffer.from('img'),
      } as Express.Multer.File;

      const result = await service.uploadAvatar('emp-1', mockFile, mockAdminUser);
      expect(result.profilePictureUrl).toContain('avatar-1.png');
      expect(mockStorageService.uploadFile).toHaveBeenCalled();
    });
  });
});
