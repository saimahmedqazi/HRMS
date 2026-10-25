import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { SuperAdminService } from './super-admin.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { EnterSupportModeDto } from './dto/support-mode.dto';
import { UpdateCompanyStatusDto } from './dto/update-company-status.dto';
import { UserRole } from '@prisma/client';

@ApiTags('super-admin')
@Controller('super-admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SuperAdminController {
  constructor(
    private readonly superAdminService: SuperAdminService,
    private readonly configService: ConfigService,
  ) {}

  @Get('companies')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OPERATION_MANAGER)
  @ApiOperation({ summary: 'List all registered companies on the platform' })
  async listCompanies() {
    return this.superAdminService.listCompanies();
  }

  @Get('companies/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OPERATION_MANAGER)
  @ApiOperation({ summary: 'Get details of a specific company' })
  async getCompanyDetails(@Param('id') id: string) {
    return this.superAdminService.getCompanyDetails(id);
  }

  @Patch('companies/:id/status')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Suspend or reactivate a company (Super Admin only)' })
  async updateCompanyStatus(
    @Param('id') id: string,
    @Body() dto: UpdateCompanyStatusDto,
    @CurrentUser() adminUser: AuthenticatedUser,
  ) {
    return this.superAdminService.updateCompanyStatus(id, dto.status, adminUser);
  }

  @Post('companies/:id/support-mode/enter')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Enter time-limited, reason-logged customer support impersonation mode',
  })
  async enterSupportMode(
    @Param('id') id: string,
    @Body() dto: EnterSupportModeDto,
    @CurrentUser() adminUser: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.superAdminService.enterSupportMode(id, dto.reason, adminUser);

    const isProd = this.configService.get<string>('app.nodeEnv') === 'production';
    res.cookie('access_token', result.accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 60 * 60 * 1000, // 1 hour
      path: '/',
    });

    return { session: result.session, message: 'Support mode activated for 1 hour' };
  }

  @Post('companies/:id/support-mode/exit')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Exit customer support impersonation mode' })
  async exitSupportMode(
    @Param('id') id: string,
    @CurrentUser() adminUser: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.superAdminService.exitSupportMode(id, adminUser);

    const isProd = this.configService.get<string>('app.nodeEnv') === 'production';
    res.cookie('access_token', result.accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000,
      path: '/',
    });

    return { message: result.message };
  }

  @Get('analytics')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OPERATION_MANAGER)
  @ApiOperation({ summary: 'Platform-wide analytics and system health' })
  async getAnalytics() {
    return this.superAdminService.getPlatformAnalytics();
  }
}
