import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '@common/prisma/prisma.service';
import { PdfService } from './pdf.service';
import { PayrollService } from './payroll.service';

describe('PayrollService', () => {
  let service: PayrollService;
  let prisma: any;
  let pdfService: any;

  const mockCompanyId = 'company-123';
  const mockUserId = 'user-hr-1';

  beforeEach(async () => {
    prisma = {
      payrollStructure: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      employee: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      department: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      payslip: {
        upsert: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      notification: {
        create: jest.fn(),
      },
      company: {
        findUnique: jest.fn(),
      },
    };

    pdfService = {
      generatePayslipPdf: jest.fn().mockResolvedValue(Buffer.from('PDF_STREAM')),
      generateBulkPayslipsPdf: jest.fn().mockResolvedValue(Buffer.from('BULK_PDF_STREAM')),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayrollService,
        { provide: PrismaService, useValue: prisma },
        { provide: PdfService, useValue: pdfService },
      ],
    }).compile();

    service = module.get<PayrollService>(PayrollService);
  });

  describe('calculatePayrollFigures', () => {
    it('should accurately compute allowances, progressive taxes, and net salary', () => {
      const baseSalary = 50000;
      const components = [
        { name: 'Transport', type: 'ALLOWANCE', value: 2000, isPercentage: false },
        { name: 'Bonus Pct', type: 'ALLOWANCE', value: 10, isPercentage: true }, // 5000
        { name: 'Health Insurance', type: 'DEDUCTION', value: 1000, isPercentage: false },
      ];
      const taxRules = {
        brackets: [
          { min: 0, max: 30000, rate: 0 },
          { min: 30000, max: 80000, rate: 0.1 },
        ],
      };

      const result = service.calculatePayrollFigures(baseSalary, components, taxRules);

      // Gross = 50000 + 2000 + 5000 = 57000
      // Deductions = 1000
      // Taxable = 57000 - 1000 = 56000
      // Tax: 0-30k @ 0 = 0, 30k-56k (26k) @ 10% = 2600
      // Net = 57000 - 1000 - 2600 = 53400
      expect(result.allowances).toBe(7000);
      expect(result.deductions).toBe(1000);
      expect(result.taxAmount).toBe(2600);
      expect(result.netSalary).toBe(53400);
    });
  });

  describe('executePayrollRun', () => {
    it('should execute payroll for all active employees and generate notifications', async () => {
      prisma.payrollStructure.findFirst.mockResolvedValue({
        id: 'struct-1',
        baseSalary: 50000,
        components: [],
        taxRules: { brackets: [] },
      });

      const mockEmployees = [
        { id: 'emp-1', userId: 'user-1', baseSalary: 50000, status: 'ACTIVE' },
        { id: 'emp-2', userId: 'user-2', baseSalary: 60000, status: 'ACTIVE' },
      ];
      prisma.employee.findMany.mockResolvedValue(mockEmployees);
      prisma.payslip.upsert.mockImplementation((args: any) => Promise.resolve({ id: 'ps-1', ...args.create }));

      const result = await service.executePayrollRun(mockCompanyId, mockUserId, {
        month: 11,
        year: 2026,
      });

      expect(result.processedEmployees).toBe(2);
      expect(prisma.payslip.upsert).toHaveBeenCalledTimes(2);
      expect(prisma.notification.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('getDepartmentPayrollSummary (Strict RBAC)', () => {
    it('should throw ForbiddenException if user is TEAM_LEAD', async () => {
      await expect(
        service.getDepartmentPayrollSummary(mockCompanyId, {
          id: 'user-lead',
          role: UserRole.TEAM_LEAD,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if user is EMPLOYEE', async () => {
      await expect(
        service.getDepartmentPayrollSummary(mockCompanyId, {
          id: 'user-emp',
          role: UserRole.EMPLOYEE,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should provide aggregate department summary for DEPARTMENT_MANAGER without individual salaries', async () => {
      prisma.employee.findFirst.mockResolvedValue({
        id: 'emp-mgr',
        departmentId: 'dept-eng',
      });
      prisma.department.findUnique.mockResolvedValue({ id: 'dept-eng', name: 'Engineering' });

      prisma.payslip.findMany.mockResolvedValue([
        { baseSalary: 50000, allowances: 5000, bonuses: 0, deductions: 1000, taxAmount: 2000, netSalary: 52000 },
        { baseSalary: 60000, allowances: 6000, bonuses: 0, deductions: 2000, taxAmount: 4000, netSalary: 60000 },
      ]);

      const summary = (await service.getDepartmentPayrollSummary(mockCompanyId, {
        id: 'user-mgr',
        role: UserRole.DEPARTMENT_MANAGER,
      })) as any;

      expect(summary.departmentName).toBe('Engineering');
      expect(summary.headcount).toBe(2);
      expect(summary.totalGross).toBe(121000); // 55000 + 66000
      expect(summary.totalNet).toBe(112000); // 52000 + 60000
      expect(summary.averageNet).toBe(56000);
      expect(summary.individualPayslips).toBeUndefined(); // Zero leakage of individual rows
    });
  });
});
