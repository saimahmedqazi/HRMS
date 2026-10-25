import {
  Controller,
  Get,
  Post,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import { WorkTimerService } from './work-timer.service';

@ApiTags('Work Timer')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('timer')
export class WorkTimerController {
  constructor(private readonly workTimerService: WorkTimerService) {}

  @Post('start')
  @ApiOperation({ summary: 'Start work timer session (Premium tier required)' })
  @Roles(
    UserRole.COMPANY_ADMIN,
    UserRole.HR_MANAGER,
    UserRole.DEPARTMENT_MANAGER,
    UserRole.TEAM_LEAD,
    UserRole.EMPLOYEE,
  )
  async startTimer(@CurrentUser() user: AuthenticatedUser) {
    return this.workTimerService.startTimer(user);
  }

  @Post('pause')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pause work timer and start break counter' })
  @Roles(
    UserRole.COMPANY_ADMIN,
    UserRole.HR_MANAGER,
    UserRole.DEPARTMENT_MANAGER,
    UserRole.TEAM_LEAD,
    UserRole.EMPLOYEE,
  )
  async pauseTimer(@CurrentUser() user: AuthenticatedUser) {
    return this.workTimerService.pauseTimer(user);
  }

  @Post('resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resume work timer, close break, and check for overstay alerts' })
  @Roles(
    UserRole.COMPANY_ADMIN,
    UserRole.HR_MANAGER,
    UserRole.DEPARTMENT_MANAGER,
    UserRole.TEAM_LEAD,
    UserRole.EMPLOYEE,
  )
  async resumeTimer(@CurrentUser() user: AuthenticatedUser) {
    return this.workTimerService.resumeTimer(user);
  }

  @Post('stop')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Stop timer, compute overtime, and sync with attendance' })
  @Roles(
    UserRole.COMPANY_ADMIN,
    UserRole.HR_MANAGER,
    UserRole.DEPARTMENT_MANAGER,
    UserRole.TEAM_LEAD,
    UserRole.EMPLOYEE,
  )
  async stopTimer(@CurrentUser() user: AuthenticatedUser) {
    return this.workTimerService.stopTimer(user);
  }

  @Get('today')
  @ApiOperation({ summary: 'Get current user live work timer status and breaks' })
  @Roles(
    UserRole.COMPANY_ADMIN,
    UserRole.HR_MANAGER,
    UserRole.DEPARTMENT_MANAGER,
    UserRole.TEAM_LEAD,
    UserRole.EMPLOYEE,
  )
  async getTodayTimer(@CurrentUser() user: AuthenticatedUser) {
    return this.workTimerService.getTodayTimer(user);
  }
}
