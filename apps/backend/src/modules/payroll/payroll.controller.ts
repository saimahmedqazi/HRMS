import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  StreamableFile,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { PayrollService } from './payroll.service';
import { CreatePayrollStructureDto } from './dto/create-payroll-structure.dto';
import { ExecutePayrollRunDto } from './dto/execute-payroll-run.dto';

@ApiTags('Payroll Management')
@ApiBearerAuth()
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
    return this.payrollService.createStructure(user.companyId, dto);
  }

  @Get('structures')
  @Roles(UserRole.COMPANY_ADMIN, UserRole.HR_MANAGER)
  @ApiOperation({ summary: 'List company salary structures' })
  async getStructures(@CurrentUser() user: any) {
    return this.payrollService.getStructures(user.companyId);
  }

  @Post('runs')
  @Roles(UserRole.COMPANY_ADMIN, UserRole.HR_MANAGER)
  @ApiOperation({ summary: 'Execute monthly payroll run' })
  async executePayrollRun(
    @CurrentUser() user: any,
    @Body() dto: ExecutePayrollRunDto,
  ) {
    return this.payrollService.executePayrollRun(user.companyId, user.id, dto);
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
    return this.payrollService.getDepartmentPayrollSummary(
      user.companyId,
      user,
      month ? parseInt(month, 10) : undefined,
      year ? parseInt(year, 10) : undefined,
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
    return this.payrollService.getPayslips(user.companyId, user, {
      month: month ? parseInt(month, 10) : undefined,
      year: year ? parseInt(year, 10) : undefined,
      employeeId,
    });
  }

  @Get('payslips/:id')
  @ApiOperation({ summary: 'Get single payslip details' })
  async getPayslipById(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.payrollService.getPayslipById(user.companyId, id, user);
  }

  @Get('payslips/:id/pdf')
  @ApiOperation({ summary: 'Download professional payslip PDF' })
  async downloadPayslipPdf(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer, filename } = await this.payrollService.generatePayslipPdfBuffer(
      user.companyId,
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
    const m = parseInt(month, 10);
    const y = parseInt(year, 10);

    const { buffer, filename } = await this.payrollService.generateBulkPayslipsPdfBuffer(
      user.companyId,
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
}
