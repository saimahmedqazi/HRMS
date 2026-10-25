import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ApprovalStatus, LeaveStatus, LeaveType, UserRole } from '@prisma/client';
import { PrismaService } from '@common/prisma/prisma.service';
import { StorageService } from '@common/storage/storage.service';
import { MailService } from '@common/mail/mail.service';
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
      leaveTypeSetting: {
        findMany: jest.fn(),
        createMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      leaveBalance: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      leaveRequest: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      employee: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
      },
      user: {
        findFirst: jest.fn(),
      },
      notification: {
        create: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(prisma)),
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
    };

    mailService = {
      sendMail: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeaveService,
        { provide: PrismaService, useValue: prisma },
        { provide: ApprovalEngineService, useValue: approvalEngine },
        { provide: StorageService, useValue: storageService },
        { provide: MailService, useValue: mailService },
      ],
    }).compile();

    service = module.get<LeaveService>(LeaveService);
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
      prisma.employee.findUnique.mockResolvedValue({ id: 'lead-1', userId: 'lead-user-id' });

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
      expect(prisma.leaveBalance.update).toHaveBeenCalledWith({
        where: { id: 'balance-1' },
        data: { pending: { increment: 3 } },
      });
      expect(prisma.notification.create).toHaveBeenCalled();
      expect(result.id).toBe('req-1');
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
        leaveTypeSetting: { leaveType: LeaveType.CASUAL },
        employee: { userId: mockUserId, firstName: 'Alice', lastName: 'Smith', user: { role: UserRole.EMPLOYEE } },
      };
      prisma.leaveRequest.findFirst.mockResolvedValue(mockRequest);
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

      expect(prisma.leaveRequest.update).toHaveBeenCalled();
      expect(prisma.notification.create).toHaveBeenCalled();
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
});
