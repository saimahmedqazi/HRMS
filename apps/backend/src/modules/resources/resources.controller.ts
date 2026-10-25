import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ResourceRequestStatus, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { ResourcesService } from './resources.service';
import { CreateResourceRequestDto } from './dto/create-resource-request.dto';
import { ApproveResourceRequestDto } from './dto/approve-resource-request.dto';
import { FulfillResourceRequestDto } from './dto/fulfill-resource-request.dto';

@ApiTags('Resource Requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('resources')
export class ResourcesController {
  constructor(private readonly resourcesService: ResourcesService) {}

  @Post('requests')
  @ApiOperation({ summary: 'Submit an equipment/software resource request' })
  async createResourceRequest(
    @CurrentUser() user: any,
    @Body() dto: CreateResourceRequestDto,
  ) {
    return this.resourcesService.createResourceRequest(user.companyId, user.id, dto);
  }

  @Get('requests')
  @ApiOperation({ summary: 'List resource requests within user scope' })
  async getResourceRequests(
    @CurrentUser() user: any,
    @Query('status') status?: ResourceRequestStatus,
  ) {
    return this.resourcesService.getResourceRequests(user.companyId, user, status);
  }

  @Post('requests/:id/approve')
  @Roles(
    UserRole.TEAM_LEAD,
    UserRole.DEPARTMENT_MANAGER,
    UserRole.HR_MANAGER,
    UserRole.COMPANY_ADMIN,
  )
  @ApiOperation({ summary: 'Approve or reject a resource request' })
  async approveResourceRequest(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: ApproveResourceRequestDto,
  ) {
    return this.resourcesService.approveResourceRequest(
      user.companyId,
      id,
      user.id,
      user.role,
      dto,
    );
  }

  @Post('requests/:id/fulfill')
  @Roles(
    UserRole.OPERATION_MANAGER,
    UserRole.HR_MANAGER,
    UserRole.COMPANY_ADMIN,
    UserRole.SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'Fulfill an approved resource request' })
  async fulfillResourceRequest(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: FulfillResourceRequestDto,
  ) {
    return this.resourcesService.fulfillResourceRequest(
      user.companyId,
      id,
      user.id,
      user.role,
      dto,
    );
  }
}
