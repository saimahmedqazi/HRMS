import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CompaniesService, UpdateCompanySettingsDto } from './companies.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('companies')
@Controller('companies')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get details of the current tenant company' })
  async getMyCompany(@CurrentUser() user: AuthenticatedUser) {
    const effectiveCompanyId = user.supportModeCompanyId || user.companyId;
    if (!effectiveCompanyId) {
      throw new UnauthorizedException('No tenant company associated with this session');
    }
    return this.companiesService.getMyCompany(effectiveCompanyId);
  }

  @Patch('me')
  @Roles(UserRole.COMPANY_ADMIN, UserRole.HR_MANAGER)
  @ApiOperation({ summary: 'Update tenant company profile and settings' })
  async updateMyCompany(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateCompanySettingsDto,
  ) {
    const effectiveCompanyId = user.supportModeCompanyId || user.companyId;
    if (!effectiveCompanyId) {
      throw new UnauthorizedException('No tenant company associated with this session');
    }
    return this.companiesService.updateMyCompany(effectiveCompanyId, dto);
  }
}
