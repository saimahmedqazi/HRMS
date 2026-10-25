import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';
import { UserRole } from '@prisma/client';

describe('PayrollController', () => {
  let controller: PayrollController;
  let mockPayrollService: jest.Mocked<Partial<PayrollService>>;

  const mockUser = {
    id: 'user-1',
    userId: 'user-1',
    companyId: 'company-1',
    role: UserRole.HR_MANAGER,
    employeeId: 'emp-1',
    departmentId: 'dept-1',
  };

  beforeEach(() => {
    mockPayrollService = {
      createStructure: jest.fn(),
      getStructures: jest.fn(),
      executePayrollRun: jest.fn(),
      getDepartmentPayrollSummary: jest.fn(),
      getPayslips: jest.fn(),
      getPayslipById: jest.fn(),
    };

    controller = new PayrollController(mockPayrollService as PayrollService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createStructure', () => {
    it('should create salary structure for company', async () => {
      const mockResult = { id: 'struct-1', name: 'Standard Engineering' } as any;
      (mockPayrollService.createStructure as jest.Mock).mockResolvedValue(mockResult);

      const dto = {
        name: 'Standard Engineering',
        baseSalary: 6000,
        components: [],
      };

      const result = await controller.createStructure(mockUser, dto);
      expect(result).toEqual(mockResult);
      expect(mockPayrollService.createStructure).toHaveBeenCalledWith('company-1', dto);
    });
  });

  describe('executePayrollRun', () => {
    it('should execute payroll run and return run summary', async () => {
      const mockResult = { id: 'run-1', month: 10, year: 2026, totalAmount: 50000 } as any;
      (mockPayrollService.executePayrollRun as jest.Mock).mockResolvedValue(mockResult);

      const dto = { month: 10, year: 2026 };
      const result = await controller.executePayrollRun(mockUser, dto);
      expect(result).toEqual(mockResult);
      expect(mockPayrollService.executePayrollRun).toHaveBeenCalledWith('company-1', 'user-1', dto);
    });
  });

  describe('getDepartmentPayrollSummary', () => {
    it('should return aggregate department metrics for managers', async () => {
      const mockSummary = {
        departmentId: 'dept-1',
        totalGross: 45000,
        totalNet: 38000,
        employeeCount: 8,
      } as any;
      (mockPayrollService.getDepartmentPayrollSummary as jest.Mock).mockResolvedValue(mockSummary);

      const result = await controller.getDepartmentPayrollSummary(mockUser, '10', '2026');
      expect(result).toEqual(mockSummary);
      expect(mockPayrollService.getDepartmentPayrollSummary).toHaveBeenCalledWith(
        'company-1',
        mockUser,
        10,
        2026,
      );
    });
  });
});
