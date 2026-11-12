import 'multer';
import {
  Controller,
  Get,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  StreamableFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { BulkImportService } from './bulk-import.service';

const spreadsheetUploadLimits = { fileSize: 10 * 1024 * 1024 };

@ApiTags('Bulk Employee Import')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('employees/bulk')
export class BulkImportController {
  constructor(private readonly bulkImportService: BulkImportService) {}

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
    @CurrentUser() user: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Excel file is required.');
    return this.bulkImportService.previewImport(user.companyId, file);
  }

  @Post('execute')
  @Roles(UserRole.COMPANY_ADMIN, UserRole.HR_MANAGER)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: spreadsheetUploadLimits }))
  @ApiOperation({ summary: 'Execute permanent bulk employee onboarding from Excel file' })
  async executeImport(
    @CurrentUser() user: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Excel file is required.');
    return this.bulkImportService.executeImport(user.companyId, file);
  }
}
