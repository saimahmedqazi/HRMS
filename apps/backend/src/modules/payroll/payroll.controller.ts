import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  StreamableFile,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiCookieAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { PayrollService } from './payroll.service';
import { CreatePayrollStructureDto } from './dto/create-payroll-structure.dto';
import { ExecutePayrollRunDto } from './dto/execute-payroll-run.dto';
import { UpdatePayslipDto } from './dto/update-payslip.dto';
import { MarkPayrollPaidDto } from './dto/mark-payroll-paid.dto';

@ApiTags('Payroll Management')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('payroll')
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Post('structures')
  @Roles(UserRole.COMPANY_ADMIN, UserRole.HR_MANAGER)
  @ApiOperation({ summary: 'Create custom salary structure' })
  async createStructure(
    @CurrentUser() user: any,
    @Body() dto: CreatePayrollStructureDto,
  ) {
    const companyId = this.requireTenantPayrollWriteCompanyId(user);
    return this.payrollService.createStructure(companyId, dto);
  }

  @Get('structures')
  @Roles(UserRole.COMPANY_ADMIN, UserRole.HR_MANAGER)
  @ApiOperation({ summary: 'List company salary structures' })
  async getStructures(@CurrentUser() user: any) {
    const companyId = this.requireCompanyId(user);
    return this.payrollService.getStructures(companyId);
  }

  @Patch('structures/:id')
  @Roles(UserRole.COMPANY_ADMIN, UserRole.HR_MANAGER)
  @ApiOperation({ summary: 'Update a company salary structure' })
  async updateStructure(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: CreatePayrollStructureDto,
  ) {
    const companyId = this.requireTenantPayrollWriteCompanyId(user);
    return this.payrollService.updateStructure(companyId, id, dto);
  }

  @Delete('structures/:id')
  @Roles(UserRole.COMPANY_ADMIN, UserRole.HR_MANAGER)
  @ApiOperation({ summary: 'Archive (soft-delete) an unused non-default salary structure' })
  async deleteStructure(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    const companyId = this.requireTenantPayrollWriteCompanyId(user);
    return this.payrollService.deleteStructure(companyId, id, user.id);
  }

  @Post('runs')
  @Roles(UserRole.COMPANY_ADMIN, UserRole.HR_MANAGER)
  @ApiOperation({ summary: 'Execute monthly payroll run' })
  async executePayrollRun(
    @CurrentUser() user: any,
    @Body() dto: ExecutePayrollRunDto,
  ) {
    const companyId = this.requireTenantPayrollWriteCompanyId(user);
    return this.payrollService.executePayrollRun(companyId, user.id, dto);
  }

  @Post('runs/mark-paid')
  @Roles(UserRole.COMPANY_ADMIN, UserRole.HR_MANAGER)
  @ApiOperation({ summary: 'Mark all payslips in a month/year period as PAID' })
  async markPeriodPaid(
    @CurrentUser() user: any,
    @Body() dto: MarkPayrollPaidDto,
  ) {
    const companyId = this.requireTenantPayrollWriteCompanyId(user);
    return this.payrollService.markPeriodPaid(companyId, user.id, dto);
  }

  @Get('department-summary')
  @Roles(
    UserRole.DEPARTMENT_MANAGER,
    UserRole.HR_MANAGER,
    UserRole.COMPANY_ADMIN,
    UserRole.SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'View aggregated department payroll summary (forbidden for Team Leads)' })
  async getDepartmentPayrollSummary(
    @CurrentUser() user: any,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    const companyId = this.requireCompanyId(user);
    return this.payrollService.getDepartmentPayrollSummary(
      companyId,
      user,
      this.parseOptionalInt(month, 'month', 1, 12),
      this.parseOptionalInt(year, 'year', 2020, 2100),
    );
  }

  @Get('payslips')
  @ApiOperation({ summary: 'Get scoped payslips list' })
  async getPayslips(
    @CurrentUser() user: any,
    @Query('month') month?: string,
    @Query('year') year?: string,
    @Query('employeeId') employeeId?: string,
  ) {
    const companyId = this.requireCompanyId(user);
    return this.payrollService.getPayslips(companyId, user, {
      month: this.parseOptionalInt(month, 'month', 1, 12),
      year: this.parseOptionalInt(year, 'year', 2020, 2100),
      employeeId,
    });
  }

  @Get('payslips/:id')
  @ApiOperation({ summary: 'Get single payslip details' })
  async getPayslipById(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    const companyId = this.requireCompanyId(user);
    return this.payrollService.getPayslipById(companyId, id, user);
  }

  @Patch('payslips/:id')
  @Roles(UserRole.COMPANY_ADMIN, UserRole.HR_MANAGER)
  @ApiOperation({ summary: 'Adjust an individual unpaid payslip (bonuses, deductions, base override)' })
  async updatePayslip(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdatePayslipDto,
  ) {
    const companyId = this.requireTenantPayrollWriteCompanyId(user);
    return this.payrollService.updatePayslip(companyId, id, user.id, dto);
  }

  @Patch('payslips/:id/mark-paid')
  @Roles(UserRole.COMPANY_ADMIN, UserRole.HR_MANAGER)
  @ApiOperation({ summary: 'Mark a single payslip as PAID (finalizes against further edits)' })
  async markPayslipPaid(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    const companyId = this.requireTenantPayrollWriteCompanyId(user);
    return this.payrollService.markPayslipPaid(companyId, id, user.id);
  }

  @Get('payslips/:id/pdf')
  @ApiOperation({ summary: 'Download professional payslip PDF' })
  async downloadPayslipPdf(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const companyId = this.requireCompanyId(user);
    const { buffer, filename } = await this.payrollService.generatePayslipPdfBuffer(
      companyId,
      id,
      user,
    );

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });

    return new StreamableFile(buffer);
  }

  @Get('runs/pdf-bulk')
  @Roles(UserRole.COMPANY_ADMIN, UserRole.HR_MANAGER)
  @ApiOperation({ summary: 'Download consolidated bulk PDF payslips for a month/year run' })
  async downloadBulkPayslipsPdf(
    @CurrentUser() user: any,
    @Query('month') month: string,
    @Query('year') year: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const companyId = this.requireCompanyId(user);
    const m = this.parseRequiredInt(month, 'month', 1, 12);
    const y = this.parseRequiredInt(year, 'year', 2020, 2100);

    const { buffer, filename } = await this.payrollService.generateBulkPayslipsPdfBuffer(
      companyId,
      m,
      y,
      user,
    );

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });

    return new StreamableFile(buffer);
  }

  private requireCompanyId(user: { companyId?: string | null; supportModeCompanyId?: string | null }): string {
    const companyId = user.supportModeCompanyId || user.companyId;
    if (!companyId) {
      throw new ForbiddenException('Company context required');
    }
    return companyId;
  }

  private requireTenantPayrollWriteCompanyId(user: {
    role?: UserRole | string;
    companyId?: string | null;
    supportModeCompanyId?: string | null;
  }): string {
    if (user.role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Payroll modifications are restricted to tenant HR Managers and Company Admins.',
      );
    }
    return this.requireCompanyId(user);
  }

  private parseOptionalInt(
    raw: string | undefined,
    name: string,
    min: number,
    max: number,
  ): number | undefined {
    if (raw === undefined || raw === '') return undefined;
    return this.parseRequiredInt(raw, name, min, max);
  }

  private parseRequiredInt(
    raw: string | undefined,
    name: string,
    min: number,
    max: number,
  ): number {
    if (raw === undefined || !/^\d+$/.test(raw.trim())) {
      throw new BadRequestException(`Invalid ${name} parameter. Expected an integer between ${min} and ${max}.`);
    }
    const parsed = Number(raw.trim());
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
      throw new BadRequestException(`Invalid ${name} parameter. Expected an integer between ${min} and ${max}.`);
    }
    return parsed;
  }
}
