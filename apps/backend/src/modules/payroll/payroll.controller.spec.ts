import { BadRequestException } from '@nestjs/common';
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
      updateStructure: jest.fn(),
      deleteStructure: jest.fn(),
      getStructures: jest.fn(),
      executePayrollRun: jest.fn(),
      markPeriodPaid: jest.fn(),
      getDepartmentPayrollSummary: jest.fn(),
      getPayslips: jest.fn(),
      getPayslipById: jest.fn(),
      updatePayslip: jest.fn(),
      markPayslipPaid: jest.fn(),
      generateBulkPayslipsPdfBuffer: jest.fn(),
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

  describe('updateStructure', () => {
    it('updates a salary structure in the signed-in company scope', async () => {
      const result = { id: 'struct-1', name: 'Updated package' } as any;
      const dto = { name: 'Updated package', baseSalary: 7000, components: [], taxRules: { brackets: [] } } as any;
      (mockPayrollService.updateStructure as jest.Mock).mockResolvedValue(result);

      await expect(controller.updateStructure(mockUser, 'struct-1', dto)).resolves.toEqual(result);
      expect(mockPayrollService.updateStructure).toHaveBeenCalledWith('company-1', 'struct-1', dto);
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

  describe('deleteStructure, updatePayslip, markPaid & query validation', () => {
    it('archives a salary structure in the signed-in company scope', async () => {
      (mockPayrollService.deleteStructure as jest.Mock).mockResolvedValue({ id: 'struct-2' });
      await expect(controller.deleteStructure(mockUser, 'struct-2')).resolves.toEqual({ id: 'struct-2' });
      expect(mockPayrollService.deleteStructure).toHaveBeenCalledWith('company-1', 'struct-2', 'user-1');
    });

    it('updates an individual payslip and marks single or period payslips as paid', async () => {
      const dto = { bonuses: 500, adjustmentDeduction: 50 };
      (mockPayrollService.updatePayslip as jest.Mock).mockResolvedValue({ id: 'ps-1', bonuses: 500 });
      (mockPayrollService.markPayslipPaid as jest.Mock).mockResolvedValue({ id: 'ps-1', status: 'PAID' });
      (mockPayrollService.markPeriodPaid as jest.Mock).mockResolvedValue({ markedCount: 3 });

      await expect(controller.updatePayslip(mockUser, 'ps-1', dto)).resolves.toEqual({ id: 'ps-1', bonuses: 500 });
      expect(mockPayrollService.updatePayslip).toHaveBeenCalledWith('company-1', 'ps-1', 'user-1', dto);

      await expect(controller.markPayslipPaid(mockUser, 'ps-1')).resolves.toEqual({ id: 'ps-1', status: 'PAID' });
      expect(mockPayrollService.markPayslipPaid).toHaveBeenCalledWith('company-1', 'ps-1', 'user-1');

      await expect(controller.markPeriodPaid(mockUser, { month: 11, year: 2026 })).resolves.toEqual({ markedCount: 3 });
      expect(mockPayrollService.markPeriodPaid).toHaveBeenCalledWith('company-1', 'user-1', { month: 11, year: 2026 });
    });

    it.each([
      ['abc', '2026'],
      ['13', '2026'],
      ['0', '2026'],
      ['10', 'xyz'],
      ['10', '1999'],
    ])('rejects invalid month=%s year=%s query params with BadRequestException', async (month, year) => {
      await expect(controller.getPayslips(mockUser, month, year)).rejects.toBeInstanceOf(BadRequestException);
      await expect(controller.getDepartmentPayrollSummary(mockUser, month, year)).rejects.toBeInstanceOf(BadRequestException);
      await expect(controller.downloadBulkPayslipsPdf(mockUser, month, year, {} as any)).rejects.toBeInstanceOf(BadRequestException);
      expect(mockPayrollService.getPayslips).not.toHaveBeenCalled();
    });
  });
});
