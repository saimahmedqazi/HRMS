import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import { DesignationsService } from './designations.service';
import { CreateDesignationDto } from './dto/create-designation.dto';
import { UpdateDesignationDto } from './dto/update-designation.dto';

@ApiTags('Designations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('designations')
export class DesignationsController {
  constructor(private readonly designationsService: DesignationsService) {}

  @Get()
  @ApiOperation({ summary: 'List all designations in company' })
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.OPERATION_MANAGER,
    UserRole.COMPANY_ADMIN,
    UserRole.HR_MANAGER,
    UserRole.DEPARTMENT_MANAGER,
    UserRole.TEAM_LEAD,
    UserRole.EMPLOYEE,
  )
  async listDesignations(@CurrentUser() user: AuthenticatedUser) {
    return this.designationsService.listDesignations(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get designation by ID' })
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.OPERATION_MANAGER,
    UserRole.COMPANY_ADMIN,
    UserRole.HR_MANAGER,
    UserRole.DEPARTMENT_MANAGER,
    UserRole.TEAM_LEAD,
    UserRole.EMPLOYEE,
  )
  async getDesignationById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.designationsService.getDesignationById(id, user);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new designation' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.HR_MANAGER)
  async createDesignation(
    @Body() dto: CreateDesignationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.designationsService.createDesignation(dto, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update designation' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.HR_MANAGER)
  async updateDesignation(
    @Param('id') id: string,
    @Body() dto: UpdateDesignationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.designationsService.updateDesignation(id, dto, user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete designation' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.HR_MANAGER)
  async deleteDesignation(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.designationsService.deleteDesignation(id, user);
  }
}
