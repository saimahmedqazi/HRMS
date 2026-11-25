import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiCookieAuth, ApiQuery } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { getRequestIp } from '../../common/utils/request-ip';
import { UserRole, AttendanceStatus } from '@prisma/client';
import { AttendanceService } from './attendance.service';
import { CheckInDto } from './dto/check-in.dto';
import { CheckOutDto } from './dto/check-out.dto';
import { CreateRemotePermissionDto } from './dto/create-remote-permission.dto';
import { ShiftPolicyDto } from './dto/shift-policy.dto';
import { AssignShiftDto } from './dto/assign-shift.dto';
import { ResolveExceptionDto } from './dto/resolve-exception.dto';

@ApiTags('Attendance')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get('shifts')
  @Roles(UserRole.COMPANY_ADMIN, UserRole.HR_MANAGER)
  listShifts(@CurrentUser() user: AuthenticatedUser) {
    return this.attendanceService.listShifts(user);
  }

  @Post('shifts')
  @Roles(UserRole.COMPANY_ADMIN)
  createShift(@Body() dto: ShiftPolicyDto, @CurrentUser() user: AuthenticatedUser) {
    return this.attendanceService.scheduleShiftPolicy(dto, user);
  }

  @Post('shifts/:id/revisions')
  @Roles(UserRole.COMPANY_ADMIN)
  reviseShift(@Param('id') id: string, @Body() dto: ShiftPolicyDto, @CurrentUser() user: AuthenticatedUser) {
    return this.attendanceService.scheduleShiftPolicy(dto, user, id);
  }

  @Post('shifts/:id/assign/:employeeId')
  @Roles(UserRole.COMPANY_ADMIN, UserRole.HR_MANAGER)
  assignShift(
    @Param('id') id: string,
    @Param('employeeId') employeeId: string,
    @Body() dto: AssignShiftDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.attendanceService.assignShift(id, employeeId, user, dto);
  }

  @Get('employees/:employeeId/shifts')
  @Roles(
    UserRole.COMPANY_ADMIN,
    UserRole.HR_MANAGER,
    UserRole.DEPARTMENT_MANAGER,
    UserRole.TEAM_LEAD,
    UserRole.EMPLOYEE,
  )
  getEmployeeShifts(
    @Param('employeeId') employeeId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.attendanceService.getEmployeeShifts(employeeId, user);
  }

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
    return this.attendanceService.checkIn(dto, getRequestIp(req), user);
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

  @Get('ip-whitelist')
  @ApiOperation({ summary: 'List company whitelisted IPs (Office & Remote/Hybrid WFH) and current client IP telemetry' })
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.COMPANY_ADMIN,
    UserRole.HR_MANAGER,
    UserRole.DEPARTMENT_MANAGER,
    UserRole.TEAM_LEAD,
    UserRole.EMPLOYEE,
  )
  async listIpWhitelist(
    @Req() req: Request,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.attendanceService.listIpWhitelist(user, getRequestIp(req));
  }

  @Post('ip-whitelist')
  @ApiOperation({ summary: 'HR/Admin: Add an Office or Remote/Hybrid WFH IP to company whitelist' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.HR_MANAGER)
  async addIpWhitelist(
    @Body() dto: { ipAddress: string; description?: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.attendanceService.addIpWhitelist(dto, user);
  }

  @Delete('ip-whitelist/:id')
  @ApiOperation({ summary: 'HR/Admin: Remove an IP from company whitelist' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.HR_MANAGER)
  async removeIpWhitelist(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.attendanceService.removeIpWhitelist(id, user);
  }
}
