import 'multer';
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { UserRole, EmployeeStatus } from '@prisma/client';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { CreateEmergencyContactDto } from './dto/create-emergency-contact.dto';

@ApiTags('Employees')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @ApiOperation({ summary: 'List employees with role-scoped data visibility' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'departmentId', required: false })
  @ApiQuery({ name: 'teamId', required: false })
  @ApiQuery({ name: 'status', enum: EmployeeStatus, required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.OPERATION_MANAGER,
    UserRole.COMPANY_ADMIN,
    UserRole.HR_MANAGER,
    UserRole.DEPARTMENT_MANAGER,
    UserRole.TEAM_LEAD,
    UserRole.EMPLOYEE,
  )
  async listEmployees(
    @CurrentUser() user: AuthenticatedUser,
    @Query('search') search?: string,
    @Query('departmentId') departmentId?: string,
    @Query('teamId') teamId?: string,
    @Query('status') status?: EmployeeStatus,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.employeesService.listEmployees(user, {
      search,
      departmentId,
      teamId,
      status,
      page,
      limit,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get employee details by ID' })
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.OPERATION_MANAGER,
    UserRole.COMPANY_ADMIN,
    UserRole.HR_MANAGER,
    UserRole.DEPARTMENT_MANAGER,
    UserRole.TEAM_LEAD,
    UserRole.EMPLOYEE,
  )
  async getEmployeeById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.employeesService.getEmployeeById(id, user);
  }

  @Post()
  @ApiOperation({ summary: 'Onboard a new employee with user credentials & shift setup' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.HR_MANAGER)
  async onboardEmployee(
    @Body() dto: CreateEmployeeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.employeesService.onboardEmployee(dto, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update employee demographics and job details' })
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.COMPANY_ADMIN,
    UserRole.HR_MANAGER,
    UserRole.DEPARTMENT_MANAGER,
    UserRole.TEAM_LEAD,
    UserRole.EMPLOYEE,
  )
  async updateEmployee(
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.employeesService.updateEmployee(id, dto, user);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update employee status badge with audit log & notifications' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.HR_MANAGER)
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.employeesService.updateStatus(id, dto, user);
  }

  @Get(':id/org-chart')
  @ApiOperation({ summary: 'Get reporting hierarchy tree for employee' })
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.OPERATION_MANAGER,
    UserRole.COMPANY_ADMIN,
    UserRole.HR_MANAGER,
    UserRole.DEPARTMENT_MANAGER,
    UserRole.TEAM_LEAD,
    UserRole.EMPLOYEE,
  )
  async getOrgChart(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.employeesService.getOrgChart(id, user);
  }

  @Post(':id/emergency-contacts')
  @ApiOperation({ summary: 'Add emergency contact' })
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.COMPANY_ADMIN,
    UserRole.HR_MANAGER,
    UserRole.EMPLOYEE,
  )
  async addEmergencyContact(
    @Param('id') id: string,
    @Body() dto: CreateEmergencyContactDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.employeesService.addEmergencyContact(id, dto, user);
  }

  @Delete(':id/emergency-contacts/:contactId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete emergency contact' })
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.COMPANY_ADMIN,
    UserRole.HR_MANAGER,
    UserRole.EMPLOYEE,
  )
  async deleteEmergencyContact(
    @Param('id') id: string,
    @Param('contactId') contactId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.employeesService.deleteEmergencyContact(id, contactId, user);
  }

  @Post(':id/avatar')
  @ApiOperation({ summary: 'Upload employee profile avatar (Cloudinary/S3)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.COMPANY_ADMIN,
    UserRole.HR_MANAGER,
    UserRole.EMPLOYEE,
  )
  async uploadAvatar(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!file) throw new BadRequestException('No avatar image provided');
    return this.employeesService.uploadAvatar(id, file, user);
  }

  @Post(':id/documents')
  @ApiOperation({ summary: 'Upload employee document (PDF/Image) to cloud storage' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.COMPANY_ADMIN,
    UserRole.HR_MANAGER,
    UserRole.EMPLOYEE,
  )
  async uploadDocument(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('name') name: string,
    @Body('type') type: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!file) throw new BadRequestException('No document file provided');
    return this.employeesService.uploadDocument(id, file, name, type, user);
  }

  @Get(':id/documents')
  @ApiOperation({ summary: 'List employee documents' })
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.OPERATION_MANAGER,
    UserRole.COMPANY_ADMIN,
    UserRole.HR_MANAGER,
    UserRole.DEPARTMENT_MANAGER,
    UserRole.TEAM_LEAD,
    UserRole.EMPLOYEE,
  )
  async listDocuments(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.employeesService.listDocuments(id, user);
  }

  @Delete(':id/documents/:documentId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete employee document' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.HR_MANAGER)
  async deleteDocument(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.employeesService.deleteDocument(id, documentId, user);
  }
}
