import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { UserRole, AttendanceStatus } from '@prisma/client';
import { AttendanceService } from './attendance.service';
import { CheckInDto } from './dto/check-in.dto';
import { CheckOutDto } from './dto/check-out.dto';
import { CreateRemotePermissionDto } from './dto/create-remote-permission.dto';
import { ResolveExceptionDto } from './dto/resolve-exception.dto';

@ApiTags('Attendance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post('check-in')
  @ApiOperation({ summary: 'Employee check-in (onsite or remote with permission check)' })
  @Roles(
    UserRole.COMPANY_ADMIN,
    UserRole.HR_MANAGER,
    UserRole.DEPARTMENT_MANAGER,
    UserRole.TEAM_LEAD,
    UserRole.EMPLOYEE,
  )
  async checkIn(
    @Body() dto: CheckInDto,
    @Req() req: Request,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
      req.socket.remoteAddress ||
      '127.0.0.1';
    return this.attendanceService.checkIn(dto, ip, user);
  }

  @Post('check-out')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Employee check-out with automatic overtime math' })
  @Roles(
    UserRole.COMPANY_ADMIN,
    UserRole.HR_MANAGER,
    UserRole.DEPARTMENT_MANAGER,
    UserRole.TEAM_LEAD,
    UserRole.EMPLOYEE,
  )
  async checkOut(
    @Body() dto: CheckOutDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.attendanceService.checkOut(dto, user);
  }

  @Get('today')
  @ApiOperation({ summary: 'Get current user today attendance record' })
  @Roles(
    UserRole.COMPANY_ADMIN,
    UserRole.HR_MANAGER,
    UserRole.DEPARTMENT_MANAGER,
    UserRole.TEAM_LEAD,
    UserRole.EMPLOYEE,
  )
  async getTodayStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.attendanceService.getTodayStatus(user);
  }

  @Get('records')
  @ApiOperation({ summary: 'List role-scoped attendance records' })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'departmentId', required: false })
  @ApiQuery({ name: 'employeeId', required: false })
  @ApiQuery({ name: 'status', enum: AttendanceStatus, required: false })
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.OPERATION_MANAGER,
    UserRole.COMPANY_ADMIN,
    UserRole.HR_MANAGER,
    UserRole.DEPARTMENT_MANAGER,
    UserRole.TEAM_LEAD,
    UserRole.EMPLOYEE,
  )
  async listAttendanceRecords(
    @CurrentUser() user: AuthenticatedUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('departmentId') departmentId?: string,
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: AttendanceStatus,
  ) {
    return this.attendanceService.listAttendanceRecords(user, {
      startDate,
      endDate,
      departmentId,
      employeeId,
      status,
    });
  }

  @Get('exceptions')
  @ApiOperation({ summary: 'HR Exceptions Queue: unauthorized remote check-ins' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.HR_MANAGER)
  async listExceptions(@CurrentUser() user: AuthenticatedUser) {
    return this.attendanceService.listExceptions(user);
  }

  @Post('exceptions/:id/resolve')
  @ApiOperation({ summary: 'Resolve attendance exception (approve remote or mark absent)' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.HR_MANAGER)
  async resolveException(
    @Param('id') id: string,
    @Body() dto: ResolveExceptionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.attendanceService.resolveException(id, dto, user);
  }

  @Post('remote-permissions')
  @ApiOperation({ summary: 'Request standing remote work permission' })
  @Roles(
    UserRole.COMPANY_ADMIN,
    UserRole.HR_MANAGER,
    UserRole.DEPARTMENT_MANAGER,
    UserRole.TEAM_LEAD,
    UserRole.EMPLOYEE,
  )
  async createRemotePermission(
    @Body() dto: CreateRemotePermissionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.attendanceService.createRemotePermission(dto, user);
  }

  @Get('remote-permissions')
  @ApiOperation({ summary: 'List standing remote work permissions' })
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.COMPANY_ADMIN,
    UserRole.HR_MANAGER,
    UserRole.DEPARTMENT_MANAGER,
    UserRole.TEAM_LEAD,
    UserRole.EMPLOYEE,
  )
  async listRemotePermissions(@CurrentUser() user: AuthenticatedUser) {
    return this.attendanceService.listRemotePermissions(user);
  }

  @Patch('remote-permissions/:id/step1')
  @ApiOperation({ summary: 'Team Lead approval for remote work permission' })
  @Roles(UserRole.COMPANY_ADMIN, UserRole.HR_MANAGER, UserRole.TEAM_LEAD)
  async approvePermissionStep1(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.attendanceService.approvePermissionStep1(id, user);
  }

  @Patch('remote-permissions/:id/step2')
  @ApiOperation({ summary: 'Department Manager final approval for remote work permission' })
  @Roles(UserRole.COMPANY_ADMIN, UserRole.HR_MANAGER, UserRole.DEPARTMENT_MANAGER)
  async approvePermissionStep2(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.attendanceService.approvePermissionStep2(id, user);
  }
}
