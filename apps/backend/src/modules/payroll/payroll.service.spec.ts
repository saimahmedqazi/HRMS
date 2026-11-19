import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException, ValidationPipe } from '@nestjs/common';
import { AuditAction, UserRole } from '@prisma/client';
import { PrismaService } from '@common/prisma/prisma.service';
import { PdfService } from './pdf.service';
import { PayrollService } from './payroll.service';
import { CreatePayrollStructureDto } from './dto/create-payroll-structure.dto';
import { UpdatePayslipDto } from './dto/update-payslip.dto';
import type { PayrollComponent } from './payroll-configuration';

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
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      employee: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      department: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      payslip: {
        upsert: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      notification: {
        create: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      company: {
        findUnique: jest.fn(),
      },
      $queryRaw: jest.fn(),
      $transaction: jest.fn((callback: (tx: typeof prisma) => unknown) => callback(prisma)),
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
      const components: PayrollComponent[] = [
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

  describe('salary package validation', () => {
    const pipe = new ValidationPipe({
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    const packageData = { name: 'Fixture package', baseSalary: 1000, components: [] };

    it.each([{ isDefault: 'false' }, { baseSalary: true }])('rejects coercion of %j', async (override) => {
      await expect(pipe.transform({ ...packageData, ...override }, { type: 'body', metatype: CreatePayrollStructureDto }))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    it.each([
      ['negative deduction', { components: [{ name: 'Adjustment', type: 'DEDUCTION', value: -100, isPercentage: false }] }, 'Salary component 1'],
      ['string percentage flag', { components: [{ name: 'Adjustment', type: 'ALLOWANCE', value: 100, isPercentage: 'false' }] }, 'Salary component 1'],
      ['malformed tax rules', { taxRules: { brackets: { min: 0, max: null, rate: 0.1 } } }, 'array of brackets'],
      ['overlapping brackets', { taxRules: { brackets: [{ min: 0, max: 1000, rate: 0.1 }, { min: 500, max: null, rate: 0.2 }] } }, 'must not overlap'],
      ['gapped brackets', { taxRules: { brackets: [{ min: 0, max: 500, rate: 0.1 }, { min: 600, max: null, rate: 0.2 }] } }, 'must be contiguous'],
      ['finite highest bracket', { taxRules: { brackets: [{ min: 0, max: 1000, rate: 0.1 }] } }, 'highest tax bracket must have an open upper bound'],
      ['excessive tax rate', { taxRules: { brackets: [{ min: 0, max: null, rate: 10 }] } }, 'rate between 0 and 1'],
      ['base salary overflow', { baseSalary: 10_000_000_000 }, 'outside the supported range'],
    ] as const)('rejects %s before opening a write transaction', async (_label, override, error) => {
      const dto = await pipe.transform({ ...packageData, ...override }, { type: 'body', metatype: CreatePayrollStructureDto });
      await expect(service.createStructure(mockCompanyId, dto)).rejects.toThrow(error);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('preserves valid adjacent brackets and an explicitly tax-free package', async () => {
      const taxRules = { brackets: [{ min: 500, max: null, rate: 0.2 }, { min: 0, max: 500, rate: 0.1 }] };
      const components = [{ name: 'Travel', type: 'ALLOWANCE', value: 100, isPercentage: false }];
      const dto = await pipe.transform({ ...packageData, components, taxRules }, { type: 'body', metatype: CreatePayrollStructureDto });
      await service.createStructure(mockCompanyId, dto);
      await service.createStructure(mockCompanyId, { ...packageData, taxRules: { brackets: [] } });
      expect(prisma.payrollStructure.create).toHaveBeenNthCalledWith(1, { data: expect.objectContaining({ components, taxRules: { brackets: [taxRules.brackets[1], taxRules.brackets[0]] } }) });
      expect(prisma.payrollStructure.create).toHaveBeenNthCalledWith(2, { data: expect.objectContaining({ taxRules: { brackets: [] } }) });
      expect(service.calculatePayrollFigures(1000, [], { brackets: [{ min: 0, max: 500, rate: 0.1 }, { min: 500, max: null, rate: 0.2 }] }).taxAmount).toBe(150);
      expect(service.calculatePayrollFigures(1000, [], { brackets: [] }).taxAmount).toBe(0);
    });

    it('updates only a structure in the current company and can mark it default', async () => {
      prisma.payrollStructure.findFirst.mockResolvedValue({ id: 'owned-structure' });
      prisma.payrollStructure.update.mockResolvedValue({ id: 'owned-structure' });
      const dto = await pipe.transform({
        ...packageData,
        currencyCode: 'CAD',
        taxRules: { brackets: [] },
        isDefault: true,
      }, { type: 'body', metatype: CreatePayrollStructureDto });

      await service.updateStructure(mockCompanyId, 'owned-structure', dto);

      expect(prisma.payrollStructure.findFirst).toHaveBeenCalledWith({
        where: { id: 'owned-structure', companyId: mockCompanyId, deletedAt: null },
        select: { id: true },
      });
      expect(prisma.payrollStructure.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { companyId: mockCompanyId, isDefault: true, id: { not: 'owned-structure' } },
      }));
      expect(prisma.payrollStructure.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'owned-structure' },
        data: expect.objectContaining({ currencyCode: 'CAD', isDefault: true }),
      }));
    });

    it('does not update a structure owned by another company', async () => {
      prisma.payrollStructure.findFirst.mockResolvedValue(null);
      const dto = await pipe.transform({ ...packageData, taxRules: { brackets: [] } }, { type: 'body', metatype: CreatePayrollStructureDto });

      await expect(service.updateStructure(mockCompanyId, 'foreign-structure', dto)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.payrollStructure.update).not.toHaveBeenCalled();
    });

    it('rejects legacy invalid rules before calculating or writing a payslip', async () => {
      prisma.payrollStructure.findFirst.mockResolvedValue({ id: 'invalid', components: [], taxRules: { brackets: 12 } });
      prisma.employee.findMany.mockResolvedValue([{ id: 'emp-1', userId: 'user-1', baseSalary: 1000, payrollStructure: null }]);
      await expect(service.executePayrollRun(mockCompanyId, mockUserId, { month: 11, year: 2026 })).rejects.toThrow('array of brackets');
      expect(prisma.payslip.upsert).not.toHaveBeenCalled();
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

    it('applies each employee’s assigned structure and falls back to the company default', async () => {
      prisma.payrollStructure.findFirst.mockResolvedValue({
        id: 'default-structure',
        baseSalary: 50000,
        currencyCode: 'USD',
        components: [],
        taxRules: { brackets: [] },
      });
      prisma.employee.findMany.mockResolvedValue([
        { id: 'emp-default', userId: 'user-default', baseSalary: 50000, payrollStructure: null },
        {
          id: 'emp-custom', userId: 'user-custom', baseSalary: 30000,
          payrollStructure: {
            id: 'custom-structure', baseSalary: 45000, currencyCode: 'USD',
            components: [{ name: 'Housing', type: 'ALLOWANCE', value: 10, isPercentage: true }],
            taxRules: { brackets: [] },
          },
        },
      ]);
      prisma.payslip.upsert.mockImplementation((args: any) => Promise.resolve({ id: 'payslip', ...args.create }));

      const result = await service.executePayrollRun(mockCompanyId, mockUserId, { month: 11, year: 2026 });

      expect(result.processedEmployees).toBe(2);
      expect(prisma.payslip.upsert).toHaveBeenNthCalledWith(1, expect.objectContaining({
        create: expect.objectContaining({ payrollStructureId: 'default-structure', baseSalary: 50000 }),
      }));
      expect(prisma.payslip.upsert).toHaveBeenNthCalledWith(2, expect.objectContaining({
        create: expect.objectContaining({
          payrollStructureId: 'custom-structure',
          baseSalary: 30000,
          allowances: 3000,
          netSalary: 33000,
        }),
      }));
    });

    it('preserves a valid zero base salary instead of substituting the structure default', async () => {
      prisma.payrollStructure.findFirst.mockResolvedValue({
        id: 'default-structure',
        baseSalary: 50000,
        currencyCode: 'USD',
        components: [],
        taxRules: { brackets: [] },
      });
      prisma.employee.findMany.mockResolvedValue([
        { id: 'commission-only', userId: 'user-commission-only', baseSalary: 0, payrollStructure: null },
      ]);
      prisma.payslip.upsert.mockImplementation((args: any) => Promise.resolve({ id: 'payslip', ...args.create }));

      await service.executePayrollRun(mockCompanyId, mockUserId, { month: 11, year: 2026 });

      expect(prisma.payslip.upsert).toHaveBeenCalledWith(expect.objectContaining({
        create: expect.objectContaining({ baseSalary: 0, netSalary: 0 }),
      }));
    });

    it('blocks a payroll run that mixes currencies', async () => {
      prisma.payrollStructure.findFirst.mockResolvedValue({
        id: 'default-structure', baseSalary: 50000, currencyCode: 'USD', components: [], taxRules: { brackets: [] },
      });
      prisma.employee.findMany.mockResolvedValue([
        { id: 'emp-us', userId: 'user-us', baseSalary: 50000, payrollStructure: null },
        {
          id: 'emp-eu', userId: 'user-eu', baseSalary: 50000,
          payrollStructure: { id: 'eur-structure', baseSalary: 50000, currencyCode: 'EUR', components: [], taxRules: { brackets: [] } },
        },
      ]);

      await expect(service.executePayrollRun(mockCompanyId, mockUserId, { month: 11, year: 2026 }))
        .rejects.toThrow('All employees in a payroll run must use the same currency');
      expect(prisma.payslip.upsert).not.toHaveBeenCalled();
    });

    it('uses deductions marked pre-tax for tax calculation, but deducts all deductions from take-home pay', () => {
      const result = service.calculatePayrollFigures(1000, [
        { name: 'Pension', type: 'DEDUCTION', value: 100, isPercentage: false, isPreTax: true },
        { name: 'Loan repayment', type: 'DEDUCTION', value: 100, isPercentage: false, isPreTax: false },
      ], { brackets: [{ min: 0, max: null, rate: 0.1 }] });

      expect(result.breakdown.taxableIncome).toBe(900);
      expect(result.deductions).toBe(200);
      expect(result.taxAmount).toBe(90);
      expect(result.netSalary).toBe(710);
    });

    it('notifies only newly issued payslips and corrections that change net pay', async () => {
      prisma.payrollStructure.findFirst.mockResolvedValue({ id: 'struct-1', components: [], taxRules: { brackets: [] } });
      prisma.employee.findMany.mockResolvedValue([
        { id: 'emp-1', userId: 'unchanged', baseSalary: 50000 },
        { id: 'emp-2', userId: 'corrected', baseSalary: 60000 },
        { id: 'emp-3', userId: 'first-issue', baseSalary: 70000 },
      ]);
      prisma.payslip.findMany.mockResolvedValue([
        { employeeId: 'emp-1', status: 'GENERATED', netSalary: 50000 },
        { employeeId: 'emp-2', status: 'GENERATED', netSalary: 55000 },
        { employeeId: 'emp-3', status: 'DRAFT', netSalary: 70000 },
      ]);
      prisma.payslip.upsert.mockResolvedValue({ id: 'payslip' });

      await service.executePayrollRun(mockCompanyId, mockUserId, { month: 11, year: 2026 });

      expect(prisma.notification.create.mock.calls.map(([call]: [{ data: { userId: string } }]) => call.data.userId))
        .toEqual(['corrected', 'first-issue']);
    });

    it('refuses to regenerate a period containing a paid payslip', async () => {
      prisma.payrollStructure.findFirst.mockResolvedValue({
        id: 'struct-1', baseSalary: 50000, currencyCode: 'USD', components: [], taxRules: { brackets: [] },
      });
      prisma.employee.findMany.mockResolvedValue([
        { id: 'emp-1', userId: 'user-1', baseSalary: 50000, payrollStructure: null },
      ]);
      prisma.payslip.findMany.mockResolvedValue([{ employeeId: 'emp-1', status: 'PAID', netSalary: 50000 }]);

      await expect(service.executePayrollRun(mockCompanyId, mockUserId, { month: 11, year: 2026 }))
        .rejects.toThrow('contains paid payslips and cannot be recalculated');
      expect(prisma.payslip.upsert).not.toHaveBeenCalled();
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

  describe('getPayslips & getPayslipById (Individual Salary Privacy)', () => {
    it('should restrict TEAM_LEAD and DEPARTMENT_MANAGER to their own payslips in getPayslips', async () => {
      prisma.employee.findFirst.mockResolvedValueOnce({ id: 'emp-lead-1', userId: 'user-lead-1' });
      prisma.payslip.findMany.mockResolvedValueOnce([]);

      await service.getPayslips(
        mockCompanyId,
        { id: 'user-lead-1', role: UserRole.TEAM_LEAD },
        { employeeId: 'emp-other-99' },
      );

      expect(prisma.payslip.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: mockCompanyId,
            employeeId: 'emp-lead-1',
          }),
        }),
      );
    });

    it('should forbid DEPARTMENT_MANAGER from viewing another employee payslip by ID', async () => {
      prisma.payslip.findFirst.mockResolvedValueOnce({
        id: 'ps-other',
        companyId: mockCompanyId,
        employee: { id: 'emp-other', userId: 'user-other' },
      });

      await expect(
        service.getPayslipById(mockCompanyId, 'ps-other', {
          id: 'user-mgr',
          role: UserRole.DEPARTMENT_MANAGER,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('filters soft-deleted employees in getPayslips and returns currencyCode in getDepartmentPayrollSummary', async () => {
      prisma.employee.findFirst.mockResolvedValueOnce({ id: 'emp-mgr', departmentId: 'dept-eng' });
      prisma.department.findUnique.mockResolvedValueOnce({ id: 'dept-eng', name: 'Engineering' });
      prisma.payslip.findMany.mockResolvedValueOnce([
        {
          baseSalary: 4000,
          allowances: 500,
          bonuses: 250,
          deductions: 100,
          taxAmount: 300,
          netSalary: 4350,
          currencyCode: 'EUR',
        },
      ]);

      const summary = (await service.getDepartmentPayrollSummary(mockCompanyId, {
        id: 'user-mgr',
        role: UserRole.DEPARTMENT_MANAGER,
      })) as any;

      expect(prisma.employee.findFirst).toHaveBeenCalledWith({
        where: { companyId: mockCompanyId, userId: 'user-mgr', deletedAt: null },
      });
      expect(summary.currencyCode).toBe('EUR');
      expect(summary.totalGross).toBe(4750);

      prisma.employee.findFirst.mockResolvedValueOnce({ id: 'emp-1', userId: 'user-emp' });
      prisma.payslip.findMany.mockResolvedValueOnce([]);
      await service.getPayslips(mockCompanyId, { id: 'user-emp', role: UserRole.EMPLOYEE });
      expect(prisma.employee.findFirst).toHaveBeenLastCalledWith({
        where: { companyId: mockCompanyId, userId: 'user-emp', deletedAt: null },
      });
    });
  });

  describe('deleteStructure & taxRules clearing', () => {
    it('clears taxRules to empty brackets when updateStructure receives null taxRules', async () => {
      prisma.payrollStructure.findFirst.mockResolvedValueOnce({ id: 'struct-1' });
      prisma.payrollStructure.update.mockResolvedValueOnce({ id: 'struct-1', taxRules: { brackets: [] } });

      await service.updateStructure(mockCompanyId, 'struct-1', {
        name: 'Tax-free package',
        currencyCode: 'USD',
        baseSalary: 4000,
        components: [],
        taxRules: null,
        isDefault: false,
      });

      expect(prisma.payrollStructure.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ taxRules: { brackets: [] } }),
      }));
    });

    it('archives an unused non-default structure and writes an audit log', async () => {
      prisma.payrollStructure.findFirst.mockResolvedValueOnce({
        id: 'struct-old',
        name: 'Legacy Package',
        currencyCode: 'USD',
        isDefault: false,
      });
      prisma.employee.count.mockResolvedValueOnce(0);
      prisma.payrollStructure.update.mockResolvedValueOnce({ id: 'struct-old', deletedAt: new Date() });

      await service.deleteStructure(mockCompanyId, 'struct-old', mockUserId);

      expect(prisma.payrollStructure.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'struct-old' },
        data: expect.objectContaining({ deletedAt: expect.any(Date), isDefault: false }),
      }));
      expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          companyId: mockCompanyId,
          userId: mockUserId,
          action: AuditAction.DELETE,
          entity: 'PayrollStructure',
          entityId: 'struct-old',
        }),
      }));
    });

    it('refuses to archive the company default structure', async () => {
      prisma.payrollStructure.findFirst.mockResolvedValueOnce({
        id: 'struct-default',
        name: 'Default',
        currencyCode: 'USD',
        isDefault: true,
      });

      await expect(service.deleteStructure(mockCompanyId, 'struct-default', mockUserId))
        .rejects.toThrow('Set another salary structure as the company default');
      expect(prisma.payrollStructure.update).not.toHaveBeenCalled();
    });

    it('refuses to archive a structure assigned to active employees', async () => {
      prisma.payrollStructure.findFirst.mockResolvedValueOnce({
        id: 'struct-assigned',
        name: 'EU Team',
        currencyCode: 'EUR',
        isDefault: false,
      });
      prisma.employee.count.mockResolvedValueOnce(2);

      await expect(service.deleteStructure(mockCompanyId, 'struct-assigned', mockUserId))
        .rejects.toThrow('Reassign 2 employee(s)');
      expect(prisma.payrollStructure.update).not.toHaveBeenCalled();
    });

    it('falls back to default structure during payroll run if assigned structure was soft-deleted', async () => {
      prisma.payrollStructure.findFirst.mockResolvedValueOnce({
        id: 'default-struct',
        baseSalary: 5000,
        currencyCode: 'USD',
        components: [],
        taxRules: { brackets: [] },
      });
      prisma.employee.findMany.mockResolvedValueOnce([
        {
          id: 'emp-1',
          userId: 'user-1',
          baseSalary: 5000,
          payrollStructure: {
            id: 'archived-struct',
            baseSalary: 9999,
            currencyCode: 'EUR',
            deletedAt: new Date(),
            components: [],
            taxRules: { brackets: [] },
          },
        },
      ]);
      prisma.payslip.upsert.mockImplementation((args: any) => Promise.resolve({ id: 'ps-1', ...args.create }));

      await service.executePayrollRun(mockCompanyId, mockUserId, { month: 11, year: 2026 });

      expect(prisma.payslip.upsert).toHaveBeenCalledWith(expect.objectContaining({
        create: expect.objectContaining({ payrollStructureId: 'default-struct', currencyCode: 'USD' }),
      }));
    });
  });

  describe('updatePayslip (Individual Adjustments, Bonuses & Deductions)', () => {
    const pipe = new ValidationPipe({
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    it('recalculates gross, tax, and net salary with bonuses and one-off deductions and records an audit log', async () => {
      prisma.payslip.findFirst.mockResolvedValueOnce({
        id: 'ps-1',
        companyId: mockCompanyId,
        status: 'GENERATED',
        baseSalary: 5000,
        bonuses: 0,
        deductions: 0,
        taxAmount: 500,
        netSalary: 4500,
        breakdown: {},
        payrollStructure: {
          id: 'struct-1',
          deletedAt: null,
          components: [
            { name: 'Housing', type: 'ALLOWANCE', value: 500, isPercentage: false },
            { name: 'Pension', type: 'DEDUCTION', value: 200, isPercentage: false, isPreTax: true },
          ],
          taxRules: { brackets: [{ min: 0, max: null, rate: 0.1 }] },
        },
        employee: { id: 'emp-1', payrollStructure: null },
      });
      prisma.payslip.update.mockImplementation((args: any) => Promise.resolve({ id: 'ps-1', ...args.data }));

      // Base 5000 + Housing 500 + Bonus 1000 = Gross 6500
      // Pre-tax deduction = 200 -> Taxable = 6300 -> Tax @ 10% = 630
      // Total deductions = 200 (recurring) + 150 (one-off post-tax) = 350
      // Net = 6500 - 350 - 630 = 5520
      const updated = await service.updatePayslip(mockCompanyId, 'ps-1', mockUserId, {
        bonuses: 1000,
        adjustmentDeduction: 150,
        adjustmentNote: 'Q4 spot bonus minus advance',
      });

      expect(updated.bonuses).toBe(1000);
      expect(updated.allowances).toBe(500);
      expect(updated.deductions).toBe(350);
      expect(updated.taxAmount).toBe(630);
      expect(updated.netSalary).toBe(5520);
      expect((updated.breakdown as any).adjustment).toMatchObject({
        bonuses: 1000,
        adjustmentDeduction: 150,
        adjustmentNote: 'Q4 spot bonus minus advance',
        updatedById: mockUserId,
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          action: AuditAction.UPDATE,
          entity: 'Payslip',
          entityId: 'ps-1',
        }),
      }));
    });

    it('rejects editing a PAID payslip', async () => {
      prisma.payslip.findFirst.mockResolvedValueOnce({
        id: 'ps-paid',
        companyId: mockCompanyId,
        status: 'PAID',
      });

      await expect(
        service.updatePayslip(mockCompanyId, 'ps-paid', mockUserId, { bonuses: 500 }),
      ).rejects.toThrow('Paid payslips are finalized and cannot be edited');
      expect(prisma.payslip.update).not.toHaveBeenCalled();
    });

    it('rejects an empty payslip adjustment payload', async () => {
      await expect(service.updatePayslip(mockCompanyId, 'ps-1', mockUserId, {}))
        .rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('validates UpdatePayslipDto strictly against negative values and type coercion', async () => {
      const metadata = { type: 'body' as const, metatype: UpdatePayslipDto };
      await expect(pipe.transform({ bonuses: 250.5, adjustmentDeduction: 50 }, metadata))
        .resolves.toMatchObject({ bonuses: 250.5, adjustmentDeduction: 50 });
      await expect(pipe.transform({ bonuses: -10 }, metadata)).rejects.toThrow(BadRequestException);
      await expect(pipe.transform({ bonuses: true }, metadata)).rejects.toThrow(BadRequestException);
      await expect(pipe.transform({ adjustmentDeduction: 12.345 }, metadata)).rejects.toThrow(BadRequestException);
    });
  });

  describe('markPayslipPaid & markPeriodPaid', () => {
    it('marks an individual payslip PAID and records an audit log', async () => {
      prisma.payslip.findFirst.mockResolvedValueOnce({
        id: 'ps-1',
        companyId: mockCompanyId,
        status: 'GENERATED',
        month: 11,
        year: 2026,
        netSalary: 5000,
        currencyCode: 'EUR',
      });
      prisma.payslip.update.mockResolvedValueOnce({ id: 'ps-1', status: 'PAID' });

      const result = await service.markPayslipPaid(mockCompanyId, 'ps-1', mockUserId);

      expect(result.status).toBe('PAID');
      expect(prisma.payslip.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'ps-1' },
        data: { status: 'PAID' },
      }));
      expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          action: AuditAction.STATUS_CHANGE,
          entity: 'Payslip',
          entityId: 'ps-1',
        }),
      }));
    });

    it('is idempotent when marking an already PAID payslip', async () => {
      prisma.payslip.findFirst.mockResolvedValueOnce({ id: 'ps-1', companyId: mockCompanyId, status: 'PAID' });

      const result = await service.markPayslipPaid(mockCompanyId, 'ps-1', mockUserId);

      expect(result.status).toBe('PAID');
      expect(prisma.payslip.update).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('marks all unpaid payslips in a period PAID and records a PAYROLL_RUN audit log', async () => {
      prisma.payslip.findMany.mockResolvedValueOnce([
        { id: 'ps-1', status: 'GENERATED' },
        { id: 'ps-2', status: 'PAID' },
      ]);
      prisma.payslip.updateMany.mockResolvedValueOnce({ count: 1 });

      const result = await service.markPeriodPaid(mockCompanyId, mockUserId, { month: 11, year: 2026 });

      expect(result).toEqual({
        month: 11,
        year: 2026,
        markedCount: 1,
        totalCount: 2,
        alreadyPaid: false,
      });
      expect(prisma.payslip.updateMany).toHaveBeenCalledWith({
        where: { companyId: mockCompanyId, month: 11, year: 2026, status: { not: 'PAID' } },
        data: { status: 'PAID' },
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          action: AuditAction.PAYROLL_RUN,
          entity: 'PayslipPeriod',
          entityId: '2026-11',
        }),
      }));
    });

    it('throws NotFoundException when marking an empty period paid', async () => {
      prisma.payslip.findMany.mockResolvedValueOnce([]);
      await expect(service.markPeriodPaid(mockCompanyId, mockUserId, { month: 2, year: 2026 }))
        .rejects.toThrow(NotFoundException);
    });
  });
});
