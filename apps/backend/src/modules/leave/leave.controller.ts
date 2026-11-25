import 'multer';
import {
  Controller,
  ForbiddenException,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiCookieAuth,
  ApiConsumes,
} from '@nestjs/swagger';
import { LeaveStatus, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { LeaveService } from './leave.service';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { ApproveStepDto } from './dto/approve-step.dto';
import { UpdateLeaveTypeDto } from './dto/update-leave-type.dto';

import { RegularizationPolicyDto } from './dto/regularization-policy.dto';

@ApiTags('Leave Management')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
  UserRole.COMPANY_ADMIN,
  UserRole.HR_MANAGER,
  UserRole.DEPARTMENT_MANAGER,
  UserRole.TEAM_LEAD,
  UserRole.EMPLOYEE,
)
@Controller('leave')
export class LeaveController {
  constructor(private readonly leaveService: LeaveService) {}

  @Get('types')
  @ApiOperation({ summary: 'List all leave types for the company' })
  async getLeaveTypes(@CurrentUser() user: any) {
    return this.leaveService.getLeaveTypes(user.companyId);
  }

  @Patch('types/:id')
  @Roles(UserRole.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Update a leave type setting (CEO only)' })
  async updateLeaveType(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateLeaveTypeDto,
  ) {
    if (user.role !== UserRole.COMPANY_ADMIN || !user.companyId || user.supportModeCompanyId) {
      throw new ForbiddenException('Only the company CEO may change leave policies');
    }
    return this.leaveService.updateLeaveType(user.companyId, id, dto);
  }

  @Get('regularization/policy')
  @Roles(UserRole.COMPANY_ADMIN)
  getRegularizationPolicy(@CurrentUser() user: any) {
    return this.leaveService.getRegularizationPolicy(user.companyId);
  }

  @Patch('regularization/policy')
  @Roles(UserRole.COMPANY_ADMIN)
  updateRegularizationPolicy(@CurrentUser() user: any, @Body() dto: RegularizationPolicyDto) {
    if (user.role !== UserRole.COMPANY_ADMIN || !user.companyId || user.supportModeCompanyId) {
      throw new ForbiddenException('Only the company CEO may change leave policies');
    }
    return this.leaveService.updateRegularizationPolicy(user.companyId, dto);
  }

  @Get('regularization/eligible')
  getEligibleAbsences(@CurrentUser() user: any) {
    return this.leaveService.getEligibleAbsences(user.companyId, user.id);
  }

  @Get('balances')
  @ApiOperation({ summary: 'Get current leave balances for requester or specific employee' })
  async getLeaveBalances(
    @CurrentUser() user: any,
    @Query('employeeId') employeeId?: string,
    @Query('year') year?: string,
  ) {
    const targetEmpId = employeeId || user.employeeId || user.id;
    return this.leaveService.getLeaveBalances(
      user.companyId,
      targetEmpId,
      year ? parseInt(year, 10) : undefined,
      user,
    );
  }

  @Post('requests')
  @ApiConsumes('multipart/form-data', 'application/json')
  @UseInterceptors(FileInterceptor('prescription', { limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Submit a new leave request (with optional or required prescription)' })
  async createLeaveRequest(
    @CurrentUser() user: any,
    @Body() dto: CreateLeaveRequestDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.leaveService.createLeaveRequest(user.companyId, user.id, dto, file);
  }

  @Get('requests')
  @ApiOperation({ summary: 'Get scoped list of leave requests' })
  async getLeaveRequests(
    @CurrentUser() user: any,
    @Query('status') status?: LeaveStatus,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.leaveService.getLeaveRequests(user.companyId, user, {
      status,
      employeeId,
    });
  }

  @Get('requests/:id')
  @ApiOperation({ summary: 'Get leave request details' })
  async getLeaveRequestById(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.leaveService.getLeaveRequestById(user.companyId, id, user);
  }

  @Post('requests/:id/step1')
  @Roles(
    UserRole.TEAM_LEAD,
    UserRole.DEPARTMENT_MANAGER,
    UserRole.HR_MANAGER,
    UserRole.COMPANY_ADMIN,
  )
  @ApiOperation({ summary: 'Step 1 approval decision' })
  async approveStep1(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: ApproveStepDto,
  ) {
    return this.leaveService.approveStep1(
      user.companyId,
      id,
      user.id,
      user.role,
      dto,
    );
  }

  @Post('requests/:id/step2')
  @Roles(UserRole.HR_MANAGER, UserRole.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Step 2 (HR / Executive) approval decision' })
  async approveStep2(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: ApproveStepDto,
  ) {
    return this.leaveService.approveStep2(
      user.companyId,
      id,
      user.id,
      user.role,
      dto,
    );
  }

  @Post('requests/:id/cancel')
  @ApiOperation({ summary: 'Cancel a pending leave request' })
  async cancelLeaveRequest(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.leaveService.cancelLeaveRequest(user.companyId, id, user.id);
  }

  @Get('requests/:id/prescription')
  @ApiOperation({ summary: 'Get medical prescription download URL for HR' })
  async getPrescription(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.leaveService.getPrescriptionDownload(user.companyId, id, user);
  }

  @Get('requests/:id/prescription/download')
  @ApiOperation({ summary: 'Open a prescription the current user can access' })
  async downloadPrescription(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    const { medicalCertUrl } = await this.leaveService.getPrescriptionDownload(user.companyId, id, user);
    response.set('Cache-Control', 'private, no-store').set('Referrer-Policy', 'no-referrer').redirect(medicalCertUrl);
  }
}
