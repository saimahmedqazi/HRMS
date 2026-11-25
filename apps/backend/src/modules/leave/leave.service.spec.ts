import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ApprovalStatus, LeaveStatus, LeaveType, UserRole } from '@prisma/client';
import { PrismaService } from '@common/prisma/prisma.service';
import { StorageService } from '@common/storage/storage.service';
import { MailService } from '@common/mail/mail.service';
import { DataScopeService } from '@common/services/data-scope.service';
import { ApprovalEngineService } from './approval-engine.service';
import { LeaveService } from './leave.service';

describe('LeaveService', () => {
  let service: LeaveService;
  let prisma: any;
  let approvalEngine: any;
  let storageService: any;
  let mailService: any;

  const mockCompanyId = 'company-123';
  const mockUserId = 'user-emp-1';
  const mockEmployeeId = 'emp-1';

  beforeEach(async () => {
    prisma = {
      company: { findUnique: jest.fn().mockResolvedValue({ timezone: 'UTC' }) },
      leaveTypeSetting: {
        findMany: jest.fn(),
        createMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      leaveBalance: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        createMany: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      leaveRequest: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      attendanceRecord: { createMany: jest.fn(), updateMany: jest.fn() },
      employee: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 'reviewer', email: 'reviewer@example.test', role: UserRole.HR_MANAGER, employee: null }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      notification: {
        create: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(prisma)),
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn().mockResolvedValue([]),
    };

    approvalEngine = {
      assertCanRequestLeave: jest.fn(),
      calculateTotalDays: jest.fn().mockReturnValue(3),
      resolveApprovers: jest.fn().mockReturnValue({
        step1ApproverId: 'lead-user-id',
        step1Status: ApprovalStatus.PENDING,
        step2ApproverId: 'hr-user-id',
        step2Status: ApprovalStatus.PENDING,
      }),
      canApprove: jest.fn().mockReturnValue(true),
    };

    storageService = {
      uploadFile: jest.fn().mockResolvedValue({ url: 'https://cloudinary.com/prescription.pdf' }),
      deleteFile: jest.fn(),
    };

    mailService = {
      sendMail: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeaveService,
        DataScopeService,
        { provide: PrismaService, useValue: prisma },
        { provide: ApprovalEngineService, useValue: approvalEngine },
        { provide: StorageService, useValue: storageService },
        { provide: MailService, useValue: mailService },
      ],
    }).compile();

    service = module.get<LeaveService>(LeaveService);
  });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T12:00:00Z'));
  });
  afterEach(() => jest.useRealTimers());

  describe('ensureDefaultLeaveTypes', () => {
    it('requires a tenant context before querying leave policies', async () => {
      await expect(service.ensureDefaultLeaveTypes(undefined as unknown as string))
        .rejects.toThrow(ForbiddenException);
      expect(prisma.leaveTypeSetting.findMany).not.toHaveBeenCalled();
      expect(prisma.leaveTypeSetting.createMany).not.toHaveBeenCalled();
    });
  });

  describe('yearly balance viewing', () => {
    it('reports an uninitialized year without creating a balance', async () => {
      prisma.employee.findFirst.mockResolvedValue({ id: mockEmployeeId });
      prisma.leaveTypeSetting.findMany.mockResolvedValue([{ id: 'type-1', leaveType: LeaveType.CASUAL }]);
      prisma.leaveBalance.findMany.mockResolvedValue([]);
      const result = await service.getLeaveBalances(mockCompanyId, mockEmployeeId, 2027, { id: mockUserId, role: UserRole.EMPLOYEE });
      expect(result).toEqual([expect.objectContaining({ year: 2027, initialized: false, leaveType: LeaveType.CASUAL })]);
      expect(prisma.leaveBalance.createMany).not.toHaveBeenCalled();
    });
  });

  describe('createLeaveRequest', () => {
    it('should throw NotFoundException if employee is not found', async () => {
      prisma.employee.findFirst.mockResolvedValue(null);

      await expect(
        service.createLeaveRequest(mockCompanyId, mockUserId, {
          leaveTypeSettingId: 'setting-1',
          startDate: '2026-11-10',
          endDate: '2026-11-12',
          reason: 'Resting',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if reason is mandatory and omitted', async () => {
      prisma.employee.findFirst.mockResolvedValue({
        id: mockEmployeeId,
        userId: mockUserId,
        firstName: 'Alice',
        lastName: 'Smith',
        status: 'ACTIVE',
        hireDate: new Date('2025-01-01'),
        user: { role: UserRole.EMPLOYEE },
      });

      prisma.leaveTypeSetting.findFirst.mockResolvedValue({
        id: 'setting-1',
        isActive: true,
        requiresReason: true,
        requiresMedicalCert: false,
        leaveType: LeaveType.CASUAL,
        annualAllocation: 10,
      });

      await expect(
        service.createLeaveRequest(mockCompanyId, mockUserId, {
          leaveTypeSettingId: 'setting-1',
          startDate: '2026-11-10',
          endDate: '2026-11-12',
          reason: '',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if sick leave requires prescription but none is provided', async () => {
      prisma.employee.findFirst.mockResolvedValue({
        id: mockEmployeeId,
        userId: mockUserId,
        firstName: 'Alice',
        lastName: 'Smith',
        status: 'ACTIVE',
        hireDate: new Date('2025-01-01'),
        user: { role: UserRole.EMPLOYEE },
      });

      prisma.leaveTypeSetting.findFirst.mockResolvedValue({
        id: 'setting-sick',
        isActive: true,
        requiresReason: true,
        requiresMedicalCert: true,
        leaveType: LeaveType.SICK,
        annualAllocation: 14,
      });

      prisma.leaveBalance.findUnique.mockResolvedValue({
        id: 'balance-1',
        allocated: 14,
        carried: 0,
        used: 0,
        pending: 0,
      });

      await expect(
        service.createLeaveRequest(mockCompanyId, mockUserId, {
          leaveTypeSettingId: 'setting-sick',
          startDate: '2026-11-10',
          endDate: '2026-11-12',
          reason: 'Severe fever',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a request without an eligible approver before reserving balance', async () => {
      prisma.employee.findFirst.mockResolvedValue({ id: mockEmployeeId, userId: mockUserId, user: { role: UserRole.EMPLOYEE } });
      prisma.leaveTypeSetting.findFirst.mockResolvedValue({ id: 'annual', isActive: true, leaveType: LeaveType.ANNUAL });
      approvalEngine.resolveApprovers.mockReturnValueOnce({
        step1ApproverId: null, step1Status: ApprovalStatus.PENDING,
        step2ApproverId: null, step2Status: ApprovalStatus.PENDING,
      });
      await expect(service.createLeaveRequest(mockCompanyId, mockUserId, {
        leaveTypeSettingId: 'annual', startDate: '2026-11-10', endDate: '2026-11-12',
      })).rejects.toThrow('No eligible leave approver');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects an inclusive overlap before reserving any balance', async () => {
      prisma.employee.findFirst.mockResolvedValue({ id: mockEmployeeId, userId: mockUserId, user: { role: UserRole.EMPLOYEE } });
      prisma.leaveTypeSetting.findFirst.mockResolvedValue({ id: 'annual', isActive: true, leaveType: LeaveType.ANNUAL });
      prisma.leaveRequest.findFirst.mockResolvedValue({ startDate: new Date('2026-12-30'), endDate: new Date('2027-01-06'), status: LeaveStatus.APPROVED });
      await expect(service.createLeaveRequest(mockCompanyId, mockUserId, {
        leaveTypeSettingId: 'annual', startDate: '2027-01-06', endDate: '2027-01-07',
      })).rejects.toThrow('overlaps an existing approved request');
      expect(prisma.$queryRaw).toHaveBeenCalled();
      expect(prisma.leaveRequest.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ companyId: mockCompanyId, employeeId: mockEmployeeId,
          OR: expect.arrayContaining([expect.objectContaining({ status: LeaveStatus.APPROVED })]) }),
      }));
      expect(prisma.leaveBalance.createMany).not.toHaveBeenCalled();
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('should successfully submit request with prescription, incrementing pending balance and notifying approver', async () => {
      const mockEmployee = {
        id: mockEmployeeId,
        userId: mockUserId,
        firstName: 'Alice',
        lastName: 'Smith',
        status: 'ACTIVE',
        hireDate: new Date('2025-01-01'),
        user: { role: UserRole.EMPLOYEE },
        team: { leadId: 'lead-1' },
      };
      prisma.employee.findFirst.mockResolvedValue(mockEmployee);
      prisma.user.findMany.mockResolvedValue([{ id: 'lead-user-id', role: UserRole.TEAM_LEAD, employee: { id: 'lead-1' } }]);

      prisma.leaveTypeSetting.findFirst.mockResolvedValue({
        id: 'setting-sick',
        isActive: true,
        requiresReason: true,
        requiresMedicalCert: true,
        leaveType: LeaveType.SICK,
        annualAllocation: 14,
      });

      prisma.leaveBalance.findUnique.mockResolvedValue({
        id: 'balance-1',
        allocated: 14,
        carried: 0,
        used: 0,
        pending: 0,
      });

      prisma.leaveRequest.create.mockResolvedValue({
        id: 'req-1',
        companyId: mockCompanyId,
        employeeId: mockEmployeeId,
        totalDays: 3,
        status: LeaveStatus.PENDING,
        medicalCertUrl: 'https://cloudinary.com/prescription.pdf',
      });

      const mockFile: any = {
        buffer: Buffer.from('prescription content'),
        mimetype: 'application/pdf',
        originalname: 'doc.pdf',
      };

      const result = await service.createLeaveRequest(
        mockCompanyId,
        mockUserId,
        {
          leaveTypeSettingId: 'setting-sick',
          startDate: '2026-11-10',
          endDate: '2026-11-12',
          reason: 'Severe flu',
        },
        mockFile,
      );

      expect(storageService.uploadFile).toHaveBeenCalled();
      expect(prisma.leaveBalance.createMany).toHaveBeenCalledWith({
        data: { companyId: mockCompanyId, employeeId: mockEmployeeId, leaveType: LeaveType.SICK, year: 2026, allocated: 14 },
        skipDuplicates: true,
      });
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      expect(prisma.notification.create).toHaveBeenCalled();
      expect(approvalEngine.resolveApprovers).toHaveBeenCalledWith(expect.objectContaining({ leadUserId: 'lead-user-id' }), undefined, undefined);
      expect(result.id).toBe('req-1');
    });

    it('does not create a request when the balance cannot be reserved and removes the uploaded attachment', async () => {
      prisma.employee.findFirst.mockResolvedValue({
        id: mockEmployeeId, userId: mockUserId, user: { role: UserRole.EMPLOYEE },
      });
      prisma.leaveTypeSetting.findFirst.mockResolvedValue({
        id: 'setting-sick', isActive: true, requiresMedicalCert: true,
        leaveType: LeaveType.SICK, annualAllocation: 14,
      });
      prisma.$executeRaw.mockResolvedValueOnce(0);
      prisma.leaveBalance.findUnique.mockResolvedValue({ allocated: 14, carried: 0, used: 8, pending: 4 });

      await expect(service.createLeaveRequest(mockCompanyId, mockUserId, {
        leaveTypeSettingId: 'setting-sick', startDate: '2026-11-10', endDate: '2026-11-12',
      }, {} as Express.Multer.File)).rejects.toThrow('Requested: 3 days, Available: 2 days.');

      expect(prisma.leaveRequest.create).not.toHaveBeenCalled();
      expect(prisma.notification.create).not.toHaveBeenCalled();
      expect(storageService.deleteFile).toHaveBeenCalledWith(
        'https://cloudinary.com/prescription.pdf', [`zenhr/companies/${mockCompanyId}/prescriptions`],
      );
    });
  });

  describe('approveStep1', () => {
    it('should approve step 1 and advance to step 2 when step 2 is pending', async () => {
      const mockRequest = {
        id: 'req-1',
        companyId: mockCompanyId,
        employeeId: mockEmployeeId,
        totalDays: 3,
        status: LeaveStatus.PENDING,
        step1Status: ApprovalStatus.PENDING,
        step2Status: ApprovalStatus.PENDING,
        step2ApproverId: 'hr-user-id',
        startDate: new Date('2026-11-10'),
        endDate: new Date('2026-11-12'),
        leaveTypeSetting: { leaveType: LeaveType.CASUAL },
        employee: { userId: mockUserId, firstName: 'Alice', lastName: 'Smith', user: { role: UserRole.EMPLOYEE } },
      };
      prisma.leaveRequest.findFirst.mockResolvedValue(mockRequest);
      prisma.user.findMany.mockResolvedValueOnce([{ id: 'fallback-hr', role: UserRole.HR_MANAGER }]);
      prisma.leaveRequest.update.mockResolvedValue({
        ...mockRequest,
        step1Status: ApprovalStatus.APPROVED,
      });

      const result = await service.approveStep1(
        mockCompanyId,
        'req-1',
        'lead-user-id',
        UserRole.TEAM_LEAD,
        { decision: 'APPROVE', notes: 'Looks good' },
      );

      expect(prisma.leaveRequest.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ step1ActorId: 'reviewer', step1ActorName: 'reviewer@example.test', step1ActorRole: UserRole.HR_MANAGER }),
      }));
      expect(prisma.notification.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: 'fallback-hr' }) });
      expect(result.step1Status).toBe(ApprovalStatus.APPROVED);
    });

    it('should reject step 1 and restore pending days to leave balance', async () => {
      const mockRequest = {
        id: 'req-1',
        companyId: mockCompanyId,
        employeeId: mockEmployeeId,
        totalDays: 3,
        status: LeaveStatus.PENDING,
        step1Status: ApprovalStatus.PENDING,
        step2Status: ApprovalStatus.PENDING,
        startDate: new Date('2026-11-10'),
        leaveTypeSetting: { leaveType: LeaveType.CASUAL },
        employee: { userId: mockUserId, firstName: 'Alice', lastName: 'Smith', user: { role: UserRole.EMPLOYEE } },
      };
      prisma.leaveRequest.findFirst.mockResolvedValue(mockRequest);
      prisma.leaveRequest.update.mockResolvedValue({
        ...mockRequest,
        step1Status: ApprovalStatus.REJECTED,
        status: LeaveStatus.REJECTED,
      });

      const result = await service.approveStep1(
        mockCompanyId,
        'req-1',
        'lead-user-id',
        UserRole.TEAM_LEAD,
        { decision: 'REJECT', notes: 'Team understaffed' },
      );

      expect(prisma.leaveBalance.updateMany).toHaveBeenCalledWith({
        where: expect.anything(),
        data: { pending: { decrement: 3 } },
      });
      expect(result.status).toBe(LeaveStatus.REJECTED);
    });
  });

  describe('partial approval', () => {
    const request = {
      id: 'partial', companyId: mockCompanyId, employeeId: mockEmployeeId,
      startDate: new Date('2026-12-28'), endDate: new Date('2027-01-06'), totalDays: 10,
      balanceDaysByYear: [{ year: 2026, days: 4 }, { year: 2027, days: 6 }],
      employee: { userId: mockUserId }, leaveTypeSetting: { leaveType: LeaveType.ANNUAL },
      status: LeaveStatus.PENDING, step1Status: ApprovalStatus.APPROVED, step2Status: ApprovalStatus.PENDING,
      step1ApprovedStart: new Date('2026-12-30'), step1ApprovedEnd: new Date('2027-01-05'),
    };
    beforeEach(() => {
      prisma.leaveRequest.findFirst.mockResolvedValue(request);
      prisma.leaveRequest.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...request, ...data }));
      approvalEngine.calculateTotalDays.mockImplementation((start: Date, end: Date) => (+end - +start) / 86400000 + 1);
    });

    it('uses only final cross-year dates and releases the original reservation once', async () => {
      await expect(service.approveStep2(mockCompanyId, request.id, 'reviewer', UserRole.HR_MANAGER, {
        decision: 'PARTIAL', approvedStart: '2026-12-30', approvedEnd: '2027-01-03', partialReason: 'Coverage needed',
      })).resolves.toMatchObject({ approvedDays: 5, approvedDaysByYear: [{ year: 2026, days: 2 }, { year: 2027, days: 3 }] });
      for (const [year, pending, used] of [[2026, 4, 2], [2027, 6, 3]]) {
        expect(prisma.leaveBalance.updateMany).toHaveBeenCalledWith({
          where: expect.objectContaining({ year, pending: { gte: pending } }),
          data: { pending: { decrement: pending }, used: { increment: used } },
        });
      }
      const attendance = prisma.attendanceRecord.createMany.mock.calls[0][0].data;
      expect(attendance.map(({ date }: { date: Date }) => date.toISOString().slice(0, 10)))
        .toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03']);
      expect(prisma.notification.create).toHaveBeenCalledWith({ data: expect.objectContaining({
        title: 'Leave Request Partially Approved', data: { leaveRequestId: 'partial' },
        body: expect.stringContaining('Coverage needed'),
      }) });
    });

    it('retains the original reservation while Step 1 narrows the scope', async () => {
      prisma.leaveRequest.findFirst.mockResolvedValue({ ...request, step1Status: ApprovalStatus.PENDING });
      await expect(service.approveStep1(mockCompanyId, request.id, 'reviewer', UserRole.HR_MANAGER, {
        decision: 'PARTIAL', approvedStart: '2026-12-30', approvedEnd: '2027-01-03', partialReason: 'Coverage needed',
      })).resolves.toMatchObject({ status: LeaveStatus.PENDING, step1ApprovedStart: new Date('2026-12-30') });
      expect(prisma.leaveBalance.updateMany).not.toHaveBeenCalled();
      expect(prisma.attendanceRecord.createMany).not.toHaveBeenCalled();
    });

    it('keeps a partial outcome when Step 2 approves the whole narrowed scope', async () => {
      await expect(service.approveStep2(mockCompanyId, request.id, 'reviewer', UserRole.HR_MANAGER, {
        decision: 'APPROVE',
      })).resolves.toMatchObject({ approvedDays: 7, approvedStart: new Date('2026-12-30') });
    });

    it('releases both original reservations on rejection after narrowing', async () => {
      await expect(service.approveStep2(mockCompanyId, request.id, 'reviewer', UserRole.HR_MANAGER, {
        decision: 'REJECT',
      })).resolves.toMatchObject({ status: LeaveStatus.REJECTED });
      expect(prisma.leaveBalance.updateMany.mock.calls.map(([args]: [{ data: unknown }]) => args.data))
        .toEqual([{ pending: { decrement: 4 } }, { pending: { decrement: 6 } }]);
      expect(prisma.attendanceRecord.createMany).not.toHaveBeenCalled();
    });

    it('releases an entire year when only dates in the other year are approved', async () => {
      await expect(service.approveStep2(mockCompanyId, request.id, 'reviewer', UserRole.HR_MANAGER, {
        decision: 'PARTIAL', approvedStart: '2027-01-01', approvedEnd: '2027-01-03', partialReason: 'Coverage needed',
      })).resolves.toMatchObject({ approvedDaysByYear: [{ year: 2027, days: 3 }] });
      expect(prisma.leaveBalance.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({ year: 2026 }), data: { pending: { decrement: 4 } },
      });
    });

    it('cancels a narrowed request without consuming either reservation', async () => {
      prisma.employee.findFirst.mockResolvedValue({ id: mockEmployeeId });
      await expect(service.cancelLeaveRequest(mockCompanyId, request.id, mockUserId))
        .resolves.toMatchObject({ status: LeaveStatus.CANCELLED });
      expect(prisma.leaveBalance.updateMany.mock.calls.map(([args]: [{ data: unknown }]) => args.data))
        .toEqual([{ pending: { decrement: 4 } }, { pending: { decrement: 6 } }]);
    });

    it.each([['2026-12-29', '2027-01-04'], ['2027-02-30', '2027-01-03'], ['2027-01-03', '2027-01-01']])(
      'rejects invalid or expanded range %s to %s', async (approvedStart, approvedEnd) => {
        await expect(service.approveStep2(mockCompanyId, request.id, 'reviewer', UserRole.HR_MANAGER, {
          decision: 'PARTIAL', approvedStart, approvedEnd, partialReason: 'Coverage needed',
        })).rejects.toThrow(BadRequestException);
        expect(prisma.leaveBalance.updateMany).not.toHaveBeenCalled();
      },
    );
  });

  describe('approveStep2 (Final Approval)', () => {
    it('should finalize leave request on step 2 approval and move pending days to used days', async () => {
      const mockRequest = {
        id: 'req-1',
        companyId: mockCompanyId,
        employeeId: mockEmployeeId,
        totalDays: 3,
        status: LeaveStatus.PENDING,
        step1Status: ApprovalStatus.APPROVED,
        step2Status: ApprovalStatus.PENDING,
        startDate: new Date('2026-11-10'),
        endDate: new Date('2026-11-12'),
        leaveTypeSetting: { leaveType: LeaveType.CASUAL },
        employee: { userId: mockUserId, firstName: 'Alice', lastName: 'Smith', user: { role: UserRole.EMPLOYEE } },
      };
      prisma.leaveRequest.findFirst.mockResolvedValue(mockRequest);
      prisma.leaveRequest.update.mockResolvedValue({
        ...mockRequest,
        step2Status: ApprovalStatus.APPROVED,
        status: LeaveStatus.APPROVED,
        finalStatus: ApprovalStatus.APPROVED,
      });

      const result = await service.approveStep2(
        mockCompanyId,
        'req-1',
        'hr-user-id',
        UserRole.HR_MANAGER,
        { decision: 'APPROVE', notes: 'HR Approved' },
      );

      expect(prisma.leaveBalance.updateMany).toHaveBeenCalledWith({
        where: expect.anything(),
        data: {
          pending: { decrement: 3 },
          used: { increment: 3 },
        },
      });
      expect(result.status).toBe(LeaveStatus.APPROVED);
    });
  });

  describe('cancelLeaveRequest', () => {
    it('should cancel pending request and restore pending days', async () => {
      prisma.employee.findFirst.mockResolvedValue({ id: mockEmployeeId, userId: mockUserId });
      const mockRequest = {
        id: 'req-1',
        companyId: mockCompanyId,
        employeeId: mockEmployeeId,
        totalDays: 2,
        status: LeaveStatus.PENDING,
        startDate: new Date('2026-11-10'),
        leaveTypeSetting: { leaveType: LeaveType.CASUAL },
      };
      prisma.leaveRequest.findFirst.mockResolvedValue(mockRequest);
      prisma.leaveRequest.update.mockResolvedValue({
        ...mockRequest,
        status: LeaveStatus.CANCELLED,
      });

      const result = await service.cancelLeaveRequest(mockCompanyId, 'req-1', mockUserId);

      expect(prisma.leaveBalance.updateMany).toHaveBeenCalledWith({
        where: expect.anything(),
        data: { pending: { decrement: 2 } },
      });
      expect(result.status).toBe(LeaveStatus.CANCELLED);
    });
  });

  describe('getLeaveRequestById', () => {
    it('queries leave request details within the employee’s own scope', async () => {
      prisma.employee.findFirst.mockResolvedValue({ id: mockEmployeeId });
      prisma.leaveRequest.findFirst.mockResolvedValue(null);

      await expect(
        service.getLeaveRequestById(mockCompanyId, 'req-other', {
          id: mockUserId,
          role: UserRole.EMPLOYEE,
        }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.leaveRequest.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          id: 'req-other',
          companyId: mockCompanyId,
          employee: { id: mockEmployeeId, companyId: mockCompanyId, deletedAt: null },
        },
      }));
    });
  });
});
