import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { NotificationType, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '@common/prisma/prisma.service';
import { PdfService } from './pdf.service';
import { CreatePayrollStructureDto } from './dto/create-payroll-structure.dto';
import { ExecutePayrollRunDto } from './dto/execute-payroll-run.dto';
import { DEFAULT_TAX_BRACKETS, PayrollComponent, PayrollTaxRules, readPayrollConfiguration, validatePayrollAmounts } from './payroll-configuration';

const PAYROLL_TRANSACTION = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 60_000 };

@Injectable()
export class PayrollService {
  private readonly logger = new Logger(PayrollService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfService: PdfService,
  ) {}

  /**
   * Ensure default salary structure exists for the company.
   */
  private async lockPayroll(tx: Prisma.TransactionClient, companyId: string): Promise<void> {
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`zenhr-payroll:${companyId}`}, 0))`;
  }

  private async ensureDefaultStructure(tx: Prisma.TransactionClient, companyId: string) {
    const existing = await tx.payrollStructure.findFirst({
      where: { companyId, isDefault: true, deletedAt: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    if (existing) return existing;

    return tx.payrollStructure.create({
      data: {
        companyId,
        name: 'Default Standard Package',
        baseSalary: 50000,
        components: [
          { name: 'Medical Allowance', type: 'ALLOWANCE', value: 3000, isPercentage: false },
          { name: 'Transport Allowance', type: 'ALLOWANCE', value: 2000, isPercentage: false },
          { name: 'Provident Fund / Insurance', type: 'DEDUCTION', value: 1500, isPercentage: false },
        ],
        taxRules: { brackets: DEFAULT_TAX_BRACKETS },
        isDefault: true,
      },
    });
  }

  /**
   * List all payroll structures for a company.
   */
  async getStructures(companyId: string) {
    const query = {
      where: { companyId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    } satisfies Prisma.PayrollStructureFindManyArgs;
    const existing = await this.prisma.payrollStructure.findMany(query);
    if (existing.some((structure) => structure.isDefault)) return existing;

    return this.prisma.$transaction(async (tx) => {
      await this.lockPayroll(tx, companyId);
      await this.ensureDefaultStructure(tx, companyId);
      return tx.payrollStructure.findMany(query);
    }, PAYROLL_TRANSACTION);
  }

  /**
   * Create a new custom payroll structure.
   */
  async createStructure(companyId: string, dto: CreatePayrollStructureDto) {
    validatePayrollAmounts([dto.baseSalary]);
    const configuration = readPayrollConfiguration(dto.components, dto.taxRules);
    return this.prisma.$transaction(async (tx) => {
      await this.lockPayroll(tx, companyId);
      if (dto.isDefault) {
        await tx.payrollStructure.updateMany({
          where: { companyId, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.payrollStructure.create({
        data: {
          companyId,
          name: dto.name,
          baseSalary: dto.baseSalary,
          components: configuration.components,
          taxRules: configuration.taxRules,
          isDefault: dto.isDefault ?? false,
        },
      });
    }, PAYROLL_TRANSACTION);
  }

  /**
   * Computes gross, allowances, deductions, taxes, and net salary.
   */
  calculatePayrollFigures(
    baseSalary: number,
    components: PayrollComponent[] = [],
    taxRules?: PayrollTaxRules,
  ) {
    let allowances = 0;
    let deductions = 0;

    for (const comp of components) {
      const amount = comp.isPercentage
        ? (baseSalary * comp.value) / 100
        : comp.value;

      if (comp.type === 'ALLOWANCE') {
        allowances += amount;
      } else if (comp.type === 'DEDUCTION') {
        deductions += amount;
      }
    }

    const grossSalary = baseSalary + allowances;
    const taxableIncome = Math.max(0, grossSalary - deductions);

    // Progressive tax calculation
    let taxAmount = 0;
    const brackets = taxRules?.brackets ?? DEFAULT_TAX_BRACKETS;

    for (const bracket of brackets) {
      if (taxableIncome > bracket.min) {
        const upper = bracket.max !== null ? Math.min(taxableIncome, bracket.max) : taxableIncome;
        const taxablePortion = upper - bracket.min;
        if (taxablePortion > 0) {
          taxAmount += taxablePortion * bracket.rate;
        }
      }
    }

    const netSalary = Math.max(0, grossSalary - deductions - taxAmount);

    const amounts = {
      baseSalary,
      allowances: Math.round(allowances * 100) / 100,
      bonuses: 0,
      deductions: Math.round(deductions * 100) / 100,
      taxAmount: Math.round(taxAmount * 100) / 100,
      netSalary: Math.round(netSalary * 100) / 100,
    };
    validatePayrollAmounts(Object.values(amounts));
    return {
      ...amounts,
      breakdown: {
        components,
        grossSalary,
        taxableIncome,
        calculatedTax: taxAmount,
      },
    };
  }

  /**
   * Execute monthly payroll run for all active company employees.
   */
  async executePayrollRun(
    companyId: string,
    userId: string,
    dto: ExecutePayrollRunDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockPayroll(tx, companyId);
      return this.writePayrollRun(tx, companyId, userId, dto);
    }, PAYROLL_TRANSACTION);
  }

  private async writePayrollRun(tx: Prisma.TransactionClient, companyId: string, userId: string, dto: ExecutePayrollRunDto) {
    const defaultStructure = await this.ensureDefaultStructure(tx, companyId);
    const configuration = readPayrollConfiguration(defaultStructure.components, defaultStructure.taxRules);

    const employees = await tx.employee.findMany({
      where: {
        companyId,
        status: { in: ['ACTIVE', 'ON_PROBATION'] },
        deletedAt: null,
      },
      select: { id: true, userId: true, baseSalary: true },
    });

    if (employees.length === 0) {
      throw new BadRequestException('No active employees found to execute payroll.');
    }

    const createdPayslips = [];
    let totalNet = 0;
    const period = { companyId, month: dto.month, year: dto.year };
    const existing = await tx.payslip.findMany({
      where: period,
      select: { employeeId: true, status: true, netSalary: true },
    });
    const previousPayslips = new Map(existing.map((payslip) => [payslip.employeeId, payslip]));
    const generatedAt = new Date();

    for (const employee of employees) {
      const baseSalary = employee.baseSalary
        ? Number(employee.baseSalary)
        : Number(defaultStructure.baseSalary);

      const figures = this.calculatePayrollFigures(
        baseSalary,
        configuration.components,
        configuration.taxRules,
      );

      const values = {
        ...figures,
        payrollStructureId: defaultStructure.id,
        status: 'GENERATED',
        generatedAt,
        generatedById: userId,
      };
      const payslip = await tx.payslip.upsert({
        where: {
          companyId_employeeId_month_year: {
            ...period,
            employeeId: employee.id,
          },
        },
        update: values,
        create: {
          ...period,
          ...values,
          employeeId: employee.id,
        },
        include: {
          employee: {
            include: {
              department: true,
              designation: true,
            },
          },
        },
      });

      totalNet += figures.netSalary;
      createdPayslips.push(payslip);

      const previous = previousPayslips.get(employee.id);
      if (previous && previous.status !== 'DRAFT' && Number(previous.netSalary) === figures.netSalary) continue;
      await tx.notification.create({
        data: {
          companyId,
          userId: employee.userId,
          type: NotificationType.PAYSLIP_GENERATED,
          title: `Payslip Issued for ${dto.month}/${dto.year}`,
          body: `Your net salary of $${figures.netSalary.toLocaleString()} for ${dto.month}/${dto.year} has been processed.`,
          data: { payslipId: payslip.id },
        },
      });
    }

    return {
      month: dto.month,
      year: dto.year,
      processedEmployees: employees.length,
      totalNetSalary: Math.round(totalNet * 100) / 100,
      payslips: createdPayslips,
    };
  }

  /**
   * Get Department Payroll Summary with strict RBAC:
   * - Department Manager: read-only aggregate summary for their department only.
   * - HR Manager / Company Admin: company-wide department summaries.
   * - Team Lead / Employee: strictly forbidden (throws 403).
   * - Individual salaries are NEVER returned in this summary.
   */
  async getDepartmentPayrollSummary(
    companyId: string,
    user: { id: string; role: UserRole },
    month?: number,
    year?: number,
  ) {
    if (user.role === UserRole.TEAM_LEAD || user.role === UserRole.EMPLOYEE) {
      throw new ForbiddenException(
        'Access denied. Team Leads and Employees cannot view department payroll summaries.',
      );
    }

    const targetMonth = month || new Date().getMonth() + 1;
    const targetYear = year || new Date().getFullYear();

    let departmentIds: string[] = [];

    if (user.role === UserRole.DEPARTMENT_MANAGER) {
      const managerEmp = await this.prisma.employee.findFirst({
        where: { companyId, userId: user.id },
      });
      if (!managerEmp || !managerEmp.departmentId) {
        throw new NotFoundException('No managed department assigned to this manager.');
      }
      departmentIds = [managerEmp.departmentId];
    } else {
      const depts = await this.prisma.department.findMany({
        where: { companyId, deletedAt: null },
        select: { id: true },
      });
      departmentIds = depts.map((d) => d.id);
    }

    const summaries = [];

    for (const deptId of departmentIds) {
      const dept = await this.prisma.department.findUnique({
        where: { id: deptId },
      });

      const payslips = await this.prisma.payslip.findMany({
        where: {
          companyId,
          month: targetMonth,
          year: targetYear,
          employee: {
            departmentId: deptId,
            deletedAt: null,
          },
        },
      });

      const headcount = payslips.length;
      const totalGross = payslips.reduce(
        (sum, p) => sum + Number(p.baseSalary) + Number(p.allowances) + Number(p.bonuses),
        0,
      );
      const totalDeductions = payslips.reduce(
        (sum, p) => sum + Number(p.deductions) + Number(p.taxAmount),
        0,
      );
      const totalNet = payslips.reduce((sum, p) => sum + Number(p.netSalary), 0);
      const averageNet = headcount > 0 ? totalNet / headcount : 0;

      summaries.push({
        departmentId: deptId,
        departmentName: dept?.name || 'Unknown',
        month: targetMonth,
        year: targetYear,
        headcount,
        totalGross: Math.round(totalGross * 100) / 100,
        totalDeductions: Math.round(totalDeductions * 100) / 100,
        totalNet: Math.round(totalNet * 100) / 100,
        averageNet: Math.round(averageNet * 100) / 100,
      });
    }

    return user.role === UserRole.DEPARTMENT_MANAGER ? summaries[0] : summaries;
  }

  /**
   * Scoped payslips listing.
   */
  async getPayslips(
    companyId: string,
    user: { id: string; role: UserRole },
    filter?: { month?: number; year?: number; employeeId?: string },
  ) {
    const where: any = { companyId };

    if (filter?.month) where.month = filter.month;
    if (filter?.year) where.year = filter.year;

    const isPayrollAdmin =
      user.role === UserRole.COMPANY_ADMIN ||
      user.role === UserRole.HR_MANAGER ||
      user.role === UserRole.SUPER_ADMIN;

    if (!isPayrollAdmin) {
      const emp = await this.prisma.employee.findFirst({
        where: { companyId, userId: user.id },
      });
      where.employeeId = emp?.id || 'none';
    } else if (filter?.employeeId) {
      where.employeeId = filter.employeeId;
    }

    return this.prisma.payslip.findMany({
      where,
      include: {
        employee: {
          include: {
            department: true,
            designation: true,
          },
        },
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });
  }

  /**
   * Single payslip details.
   */
  async getPayslipById(
    companyId: string,
    id: string,
    user: { id: string; role: UserRole },
  ) {
    const payslip = await this.prisma.payslip.findFirst({
      where: { id, companyId },
      include: {
        company: true,
        employee: {
          include: {
            department: true,
            designation: true,
          },
        },
      },
    });

    if (!payslip) {
      throw new NotFoundException('Payslip not found.');
    }

    const isPayrollAdmin =
      user.role === UserRole.COMPANY_ADMIN ||
      user.role === UserRole.HR_MANAGER ||
      user.role === UserRole.SUPER_ADMIN;

    if (!isPayrollAdmin && payslip.employee.userId !== user.id) {
      throw new ForbiddenException('You cannot access another employee payslip.');
    }

    return payslip;
  }

  /**
   * Generate PDF buffer for a payslip.
   */
  async generatePayslipPdfBuffer(
    companyId: string,
    id: string,
    user: { id: string; role: UserRole },
  ): Promise<{ buffer: Buffer; filename: string }> {
    const payslip = await this.getPayslipById(companyId, id, user);

    const buffer = await this.pdfService.generatePayslipPdf({
      companyName: payslip.company.name,
      employeeName: `${payslip.employee.firstName} ${payslip.employee.lastName}`,
      employeeCode: payslip.employee.employeeCode,
      departmentName: payslip.employee.department?.name,
      designationName: payslip.employee.designation?.name,
      month: payslip.month,
      year: payslip.year,
      baseSalary: Number(payslip.baseSalary),
      allowances: Number(payslip.allowances),
      bonuses: Number(payslip.bonuses),
      deductions: Number(payslip.deductions),
      taxAmount: Number(payslip.taxAmount),
      netSalary: Number(payslip.netSalary),
    });

    const filename = `Payslip_${payslip.employee.employeeCode}_${payslip.month}_${payslip.year}.pdf`;
    return { buffer, filename };
  }

  /**
   * Bulk PDF generation for a given month and year.
   */
  async generateBulkPayslipsPdfBuffer(
    companyId: string,
    month: number,
    year: number,
    user: { id: string; role: UserRole },
  ): Promise<{ buffer: Buffer; filename: string }> {
    if (
      user.role !== UserRole.COMPANY_ADMIN &&
      user.role !== UserRole.HR_MANAGER &&
      user.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException('Only HR Managers and Company Admins can export bulk payslips.');
    }

    const company = await this.prisma.company.findUnique({ where: { id: companyId } });

    const payslips = await this.prisma.payslip.findMany({
      where: { companyId, month, year },
      include: {
        employee: {
          include: {
            department: true,
            designation: true,
          },
        },
      },
    });

    if (payslips.length === 0) {
      throw new NotFoundException('No payslips found for the requested period.');
    }

    const pdfData = payslips.map((p) => ({
      companyName: company?.name || 'ZenHR Platform',
      employeeName: `${p.employee.firstName} ${p.employee.lastName}`,
      employeeCode: p.employee.employeeCode,
      departmentName: p.employee.department?.name,
      designationName: p.employee.designation?.name,
      month: p.month,
      year: p.year,
      baseSalary: Number(p.baseSalary),
      allowances: Number(p.allowances),
      bonuses: Number(p.bonuses),
      deductions: Number(p.deductions),
      taxAmount: Number(p.taxAmount),
      netSalary: Number(p.netSalary),
    }));

    const buffer = await this.pdfService.generateBulkPayslipsPdf(pdfData);
    const filename = `Bulk_Payslips_${company?.name.replace(/\s+/g, '_')}_${month}_${year}.pdf`;
    return { buffer, filename };
  }
}
