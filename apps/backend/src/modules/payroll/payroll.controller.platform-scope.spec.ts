import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';

describe('PayrollController platform role company scope', () => {
  const payrollService = {
    getDepartmentPayrollSummary: jest.fn(),
    getPayslips: jest.fn(),
    getPayslipById: jest.fn(),
    generatePayslipPdfBuffer: jest.fn(),
  } as unknown as jest.Mocked<PayrollService>;
  const controller = new PayrollController(payrollService);
  const superAdmin = { id: 'platform-admin', role: UserRole.SUPER_ADMIN, companyId: null };

  beforeEach(() => jest.clearAllMocks());

  it('rejects department payroll summary without tenant context', async () => {
    await expect(controller.getDepartmentPayrollSummary(superAdmin)).rejects.toBeInstanceOf(ForbiddenException);
    expect(payrollService.getDepartmentPayrollSummary).not.toHaveBeenCalled();
  });

  it('rejects payslip listing without tenant context', async () => {
    await expect(controller.getPayslips(superAdmin)).rejects.toBeInstanceOf(ForbiddenException);
    expect(payrollService.getPayslips).not.toHaveBeenCalled();
  });

  it('rejects payslip details without tenant context', async () => {
    await expect(controller.getPayslipById(superAdmin, 'payslip-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(payrollService.getPayslipById).not.toHaveBeenCalled();
  });

  it('rejects payslip PDF download without tenant context', async () => {
    await expect(controller.downloadPayslipPdf(superAdmin, 'payslip-1', {} as any))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(payrollService.generatePayslipPdfBuffer).not.toHaveBeenCalled();
  });

  it('uses the explicitly authorized support tenant for payroll reads', async () => {
    const supportUser = { ...superAdmin, supportModeCompanyId: 'tenant-acme' };
    payrollService.getPayslips.mockResolvedValue([]);

    await controller.getPayslips(supportUser);

    expect(payrollService.getPayslips).toHaveBeenCalledWith('tenant-acme', supportUser, {
      month: undefined,
      year: undefined,
      employeeId: undefined,
    });
  });
});
