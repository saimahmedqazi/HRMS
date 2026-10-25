import 'multer';
import { LeaveController } from './leave.controller';
import { LeaveService } from './leave.service';
import { UserRole, LeaveStatus } from '@prisma/client';

describe('LeaveController', () => {
  let controller: LeaveController;
  let mockLeaveService: jest.Mocked<Partial<LeaveService>>;

  const mockUser = {
    id: 'user-1',
    userId: 'user-1',
    companyId: 'company-1',
    role: UserRole.EMPLOYEE,
    employeeId: 'emp-1',
    departmentId: 'dept-1',
    teamId: 'team-1',
  };

  beforeEach(() => {
    mockLeaveService = {
      getLeaveTypes: jest.fn(),
      updateLeaveType: jest.fn(),
      getLeaveBalances: jest.fn(),
      createLeaveRequest: jest.fn(),
      getLeaveRequests: jest.fn(),
      getLeaveRequestById: jest.fn(),
      approveStep1: jest.fn(),
      approveStep2: jest.fn(),
      cancelLeaveRequest: jest.fn(),
    };

    controller = new LeaveController(mockLeaveService as LeaveService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getLeaveTypes', () => {
    it('should return leave types for tenant', async () => {
      const mockTypes = [{ id: 'type-1', name: 'Annual Leave' }] as any;
      (mockLeaveService.getLeaveTypes as jest.Mock).mockResolvedValue(mockTypes);

      const result = await controller.getLeaveTypes(mockUser);
      expect(result).toEqual(mockTypes);
      expect(mockLeaveService.getLeaveTypes).toHaveBeenCalledWith('company-1');
    });
  });

  describe('getLeaveBalances', () => {
    it('should return balances for the employee', async () => {
      const mockBalances = [{ id: 'bal-1', totalDays: 10, usedDays: 2 }] as any;
      (mockLeaveService.getLeaveBalances as jest.Mock).mockResolvedValue(mockBalances);

      const result = await controller.getLeaveBalances(mockUser, undefined, '2026');
      expect(result).toEqual(mockBalances);
      expect(mockLeaveService.getLeaveBalances).toHaveBeenCalledWith('company-1', 'emp-1', 2026);
    });
  });

  describe('createLeaveRequest', () => {
    it('should submit leave request with optional prescription file', async () => {
      const mockCreated = { id: 'leave-1', status: LeaveStatus.PENDING } as any;
      (mockLeaveService.createLeaveRequest as jest.Mock).mockResolvedValue(mockCreated);

      const dto = {
        leaveTypeSettingId: 'setting-1',
        startDate: '2026-11-01',
        endDate: '2026-11-03',
        reason: 'Flu symptoms',
      };
      const mockFile: Express.Multer.File = {
        fieldname: 'prescription',
        originalname: 'rx.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        buffer: Buffer.from('fake-pdf'),
        size: 8,
      } as any;

      const result = await controller.createLeaveRequest(mockUser, dto, mockFile);
      expect(result).toEqual(mockCreated);
      expect(mockLeaveService.createLeaveRequest).toHaveBeenCalledWith(
        'company-1',
        'user-1',
        dto,
        mockFile,
      );
    });
  });

  describe('approveStep1', () => {
    it('should route step 1 approval to service', async () => {
      const mockApproved = { id: 'leave-1', status: LeaveStatus.APPROVED } as any;
      (mockLeaveService.approveStep1 as jest.Mock).mockResolvedValue(mockApproved);

      const dto = { decision: 'APPROVE' as const, remarks: 'Looks good' };
      const result = await controller.approveStep1(mockUser, 'leave-1', dto);
      expect(result).toEqual(mockApproved);
      expect(mockLeaveService.approveStep1).toHaveBeenCalledWith(
        'company-1',
        'leave-1',
        'user-1',
        UserRole.EMPLOYEE,
        dto,
      );
    });
  });
});
