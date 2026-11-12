import 'multer';
import {
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  ForbiddenException,
  StreamableFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { AuthenticatedUser, CurrentUser } from '@common/decorators/current-user.decorator';
import { BulkImportService } from './bulk-import.service';
import { BulkImportJobsService } from './bulk-import-jobs.service';

const spreadsheetUploadLimits = { fileSize: 10 * 1024 * 1024 };

@ApiTags('Bulk Employee Import')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('employees/bulk')
export class BulkImportController {
  constructor(
    private readonly bulkImportService: BulkImportService,
    private readonly jobs: BulkImportJobsService,
  ) {}

  private account(user: AuthenticatedUser) {
    const userId = user.id || user.sub;
    if (!user.companyId || !userId) throw new ForbiddenException('A company account is required.');
    return { companyId: user.companyId, userId, supportModeSessionId: user.supportModeSessionId };
  }

  @Get('template')
  @Roles(UserRole.COMPANY_ADMIN, UserRole.HR_MANAGER)
  @ApiOperation({ summary: 'Download the employee import spreadsheet template' })
  downloadTemplate() {
    return new StreamableFile(this.bulkImportService.createTemplate(), {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="workforce-import-sample.xlsx"',
    });
  }

  @Post('preview')
  @Roles(UserRole.COMPANY_ADMIN, UserRole.HR_MANAGER)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: spreadsheetUploadLimits }))
  @ApiOperation({ summary: 'Preview and validate bulk employee Excel import without saving' })
  async previewImport(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Excel file is required.');
    return this.bulkImportService.previewImport(this.account(user).companyId, file);
  }

  @Post('execute')
  @HttpCode(HttpStatus.ACCEPTED)
  @Roles(UserRole.COMPANY_ADMIN, UserRole.HR_MANAGER)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: spreadsheetUploadLimits }))
  @ApiOperation({ summary: 'Queue bulk employee onboarding from a spreadsheet' })
  async executeImport(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Excel file is required.');
    const { companyId, userId, supportModeSessionId } = this.account(user);
    return this.jobs.submit(companyId, userId, file.buffer, supportModeSessionId);
  }

  @Get('jobs/:id')
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.COMPANY_ADMIN, UserRole.HR_MANAGER)
  @ApiOperation({ summary: 'Read the current account’s import progress and results' })
  async getStatus(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const { companyId, userId } = this.account(user);
    return this.jobs.getStatus(companyId, userId, id);
  }
}
