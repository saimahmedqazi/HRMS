import 'multer';
import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
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

@ApiTags('Leave Management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('leave')
export class LeaveController {
  constructor(private readonly leaveService: LeaveService) {}

  @Get('types')
  @ApiOperation({ summary: 'List all leave types for the company' })
  async getLeaveTypes(@CurrentUser() user: any) {
    return this.leaveService.getLeaveTypes(user.companyId);
  }

  @Patch('types/:id')
  @Roles(UserRole.COMPANY_ADMIN, UserRole.HR_MANAGER)
  @ApiOperation({ summary: 'Update a leave type setting (HR / Admin only)' })
  async updateLeaveType(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateLeaveTypeDto,
  ) {
    return this.leaveService.updateLeaveType(user.companyId, id, dto);
  }

  @Get('balances')
  @ApiOperation({ summary: 'Get current leave balances for requester or specific employee' })
  async getLeaveBalances(
    @CurrentUser() user: any,
    @Query('employeeId') employeeId?: string,
    @Query('year') year?: string,
  ) {
    const targetEmpId = employeeId || user.employeeId;
    return this.leaveService.getLeaveBalances(
      user.companyId,
      targetEmpId,
      year ? parseInt(year, 10) : undefined,
    );
  }

  @Post('requests')
  @ApiConsumes('multipart/form-data', 'application/json')
  @UseInterceptors(FileInterceptor('prescription'))
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
    return this.leaveService.getLeaveRequestById(user.companyId, id);
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
}
