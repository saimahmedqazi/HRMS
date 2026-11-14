import 'multer';
import { Test, TestingModule } from '@nestjs/testing';
import { EmployeesService } from './employees.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DataScopeService } from '../../common/services/data-scope.service';
import { MailService } from '../../common/mail/mail.service';
import { StorageService } from '../../common/storage/storage.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ConflictException, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole, EmployeeStatus, AuditAction } from '@prisma/client';

describe('EmployeesService', () => {
  let service: EmployeesService;

  const mockPrisma: any = {
    employee: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
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
    emergencyContact: {
      create: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
    $queryRaw: jest.fn(),
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
    it.each([
      { hireDate: '2026-02-30' },
      { hireDate: 'not-a-date' },
      { dateOfBirth: '1995-02-29' },
      { dateOfBirth: '2099-01-01' },
    ])('rejects invalid dates before creating an employee %j', async (dates) => {
      await expect(service.onboardEmployee({
        firstName: 'QA', lastName: 'Employee', email: 'employee@example.test', ...dates,
      }, mockAdminUser)).rejects.toBeInstanceOf(BadRequestException);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects roles outside the tenant onboarding role list before writing a user', async () => {
      await expect(service.onboardEmployee({
        firstName: 'QA',
        lastName: 'Employee',
        email: 'employee@example.test',
        role: UserRole.SUPER_ADMIN,
      }, mockAdminUser)).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

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

    it.each([
      { lastCode: 'EMP-005', nextCode: 'EMP-006', welcomeEmailSent: true },
      { lastCode: 'emp-006', nextCode: 'EMP-007', welcomeEmailSent: false },
    ])('onboards with $nextCode when the last employee uses $lastCode', async ({ lastCode, nextCode, welcomeEmailSent }) => {
      mockMailService.sendMail.mockResolvedValueOnce(welcomeEmailSent);
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);
      mockPrisma.employee.findMany.mockResolvedValueOnce([
        'EMP-001', 'EMP-002', 'EMP-003', 'EMP-004', lastCode,
      ].map((employeeCode) => ({ employeeCode })));
      mockPrisma.user.create.mockResolvedValueOnce({
        id: 'new-user-id',
        email: 'sarah@acme.com',
        role: UserRole.EMPLOYEE,
      });
      mockPrisma.employee.create.mockResolvedValueOnce({
        id: 'new-emp-id',
        employeeCode: nextCode,
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
          hireDate: '2025-01-15',
          salary: 0,
        },
        mockAdminUser,
      );

      expect(result.employeeCode).toBe(nextCode);
      expect(result.welcomeEmailSent).toBe(welcomeEmailSent);
      expect(result.tempPassword).toBeTruthy();
      expect(mockPrisma.employee.findMany).toHaveBeenCalledWith({
        where: { companyId: mockAdminUser.companyId }, select: { employeeCode: true },
      });
      expect(result.status).toBe(EmployeeStatus.ON_PROBATION);
      expect(mockPrisma.employeeShift.create).toHaveBeenCalledWith({
        data: { companyId: mockAdminUser.companyId, employeeId: 'new-emp-id', shiftId: 'default-shift', effectiveFrom: expect.any(Date) },
      });
      expect(mockPrisma.employee.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            employeeCode: nextCode,
            firstName: 'Sarah',
            hireDate: new Date('2025-01-15'),
            probationEndDate: new Date('2025-04-15'),
            baseSalary: 0,
            status: EmployeeStatus.ON_PROBATION,
          }),
        }),
      );
      expect(mockMailService.sendMail).toHaveBeenCalled();
    });
  });

  describe('updateStatus', () => {
    beforeEach(() => {
      mockPrisma.employee.updateMany.mockResolvedValue({ count: 1 });
    });

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
      mockPrisma.employee.findUniqueOrThrow.mockResolvedValueOnce({
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

    it.each([EmployeeStatus.SUSPENDED, EmployeeStatus.TERMINATED, EmployeeStatus.RESIGNED])(
      'revokes existing sessions before emailing when status changes to %s', async (status) => {
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
        mockPrisma.employee.findUniqueOrThrow.mockResolvedValueOnce({
          id: 'emp-1',
          status,
        });
        mockPrisma.auditLog.create.mockResolvedValueOnce({});
        mockPrisma.notification.create.mockResolvedValueOnce({});
        mockPrisma.user.update.mockResolvedValueOnce({});

        await service.updateStatus(
          'emp-1',
          { status, reason: 'Fixture status change' },
          mockAdminUser,
        );

        expect(mockPrisma.user.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: 'user-1' },
            data: expect.objectContaining({
              lockedUntil: expect.any(Date),
              refreshTokenHash: null,
              sessionVersion: { increment: 1 },
            }),
          }),
        );
        const [locked] = mockPrisma.user.update.mock.invocationCallOrder;
        const [mailSent] = mockMailService.sendMail.mock.invocationCallOrder;
        expect(locked).toBeLessThan(mailSent);
      },
    );

    it('removes the employment lock after an employee returns to an active status', async () => {
      mockPrisma.employee.findFirst.mockResolvedValueOnce({
        id: 'emp-1', status: EmployeeStatus.TERMINATED, userId: 'user-1',
        user: { email: 'employee@example.test' }, reportingManager: null,
      });
      mockPrisma.employee.findUniqueOrThrow.mockResolvedValueOnce({ id: 'emp-1', status: EmployeeStatus.ON_PROBATION });

      await service.updateStatus('emp-1', { status: EmployeeStatus.ON_PROBATION }, mockAdminUser);

      expect(mockPrisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'user-1', lockedUntil: new Date('9999-12-31') },
        data: { lockedUntil: null, failedLoginAttempts: 0 },
      });
    });

    it('rejects a concurrent status change without sending notifications', async () => {
      mockPrisma.employee.findFirst.mockResolvedValueOnce({ id: 'emp-1', status: EmployeeStatus.ACTIVE });
      mockPrisma.employee.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.updateStatus('emp-1', { status: EmployeeStatus.SUSPENDED }, mockAdminUser))
        .rejects.toThrow(ConflictException);

      expect(mockPrisma.employee.updateMany).toHaveBeenCalledWith({
        where: { id: 'emp-1', companyId: 'comp-1', deletedAt: null, status: EmployeeStatus.ACTIVE },
        data: { status: EmployeeStatus.SUSPENDED },
      });
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
      expect(mockMailService.sendMail).not.toHaveBeenCalled();
    });

    it('should notify reportingManager using reportingManager.userId rather than employee id', async () => {
      mockPrisma.employee.findFirst.mockResolvedValueOnce({
        id: 'emp-1',
        employeeCode: 'EMP-001',
        firstName: 'Arthur',
        lastName: 'Pendelton',
        status: EmployeeStatus.ACTIVE,
        userId: 'user-1',
        user: { email: 'arthur@acme.com' },
        reportingManager: {
          id: 'emp-mgr-99',
          userId: 'user-mgr-99',
          user: { email: 'mgr@acme.com' },
        },
      });
      mockPrisma.employee.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'emp-1',
        status: EmployeeStatus.SUSPENDED,
      });
      mockPrisma.auditLog.create.mockResolvedValueOnce({});
      mockPrisma.notification.create.mockResolvedValue({});
      mockPrisma.user.update.mockResolvedValueOnce({});

      await service.updateStatus(
        'emp-1',
        { status: EmployeeStatus.SUSPENDED, reason: 'Policy violation' },
        mockAdminUser,
      );

      expect(mockPrisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-mgr-99',
          }),
        }),
      );
    });
  });

  describe('updateEmployee', () => {
    const profileOwner = { id: 'employee-user', email: 'fixture@example.test', role: UserRole.EMPLOYEE, companyId: 'comp-1' };

    it('updates the owner’s personal fields and clears optional values', async () => {
      mockPrisma.employee.findFirst.mockResolvedValueOnce({ id: 'emp-1', userId: profileOwner.id });
      mockPrisma.employee.update.mockResolvedValueOnce({ id: 'emp-1', phone: '+1 555 0102', dateOfBirth: null });

      await service.updateEmployee('emp-1', { phone: ' +1 555 0102 ', dateOfBirth: null, address: '' }, profileOwner);

      expect(mockPrisma.employee.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'emp-1', userId: profileOwner.id, companyId: 'comp-1', deletedAt: null },
        data: expect.objectContaining({ phone: '+1 555 0102', address: null, dateOfBirth: null }),
      }));
    });

    it('rejects the entire self-service update when it includes an HR-managed field', async () => {
      mockPrisma.employee.findFirst.mockResolvedValueOnce({ id: 'emp-1', userId: profileOwner.id });

      await expect(service.updateEmployee('emp-1', { phone: '+1 555 0102', salary: 1 }, profileOwner))
        .rejects.toThrow(ForbiddenException);
      expect(mockPrisma.employee.update).not.toHaveBeenCalled();
    });

    it('should prevent employee from selecting themselves as their reporting manager', async () => {
      mockPrisma.employee.findFirst.mockResolvedValueOnce({
        id: 'emp-1',
        companyId: 'comp-1',
      });

      await expect(
        service.updateEmployee('emp-1', { reportingManagerId: 'emp-1' }, mockAdminUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('should restrict TEAM_LEAD from updating another employee profile or sensitive fields', async () => {
      mockPrisma.employee.findFirst.mockResolvedValueOnce({
        id: 'emp-other',
        userId: 'user-other',
        companyId: 'comp-1',
      });

      await expect(
        service.updateEmployee(
          'emp-other',
          { salary: 999999 },
          { id: 'user-lead', email: 'lead@acme.com', role: UserRole.TEAM_LEAD, companyId: 'comp-1' },
        ),
      ).rejects.toThrow(ForbiddenException);
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

  describe('deleteEmergencyContact', () => {
    it('should reject deleting an emergency contact that does not belong to the employee', async () => {
      mockPrisma.employee.findFirst.mockResolvedValueOnce({
        id: 'emp-1',
        companyId: 'comp-1',
        userId: 'user-1',
      });
      mockPrisma.emergencyContact.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.deleteEmergencyContact('emp-1', 'foreign-contact-id', mockAdminUser),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.emergencyContact.delete).not.toHaveBeenCalled();
    });
  });
});
