import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { AnalyticsService } from './analytics.service';

@ApiTags('Analytics & Telemetry')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Get unified role-scoped dashboard metrics' })
  async getOverview(@CurrentUser() user: any) {
    return this.analyticsService.getDashboardOverview(user.companyId, user);
  }

  @Get('super-admin')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OPERATION_MANAGER)
  @ApiOperation({ summary: 'Get platform-wide Super Admin telemetry' })
  async getSuperAdminMetrics() {
    return this.analyticsService.getSuperAdminMetrics();
  }
}
