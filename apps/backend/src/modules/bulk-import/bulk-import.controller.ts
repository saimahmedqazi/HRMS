import 'multer';
import {
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { BulkImportService } from './bulk-import.service';

@ApiTags('Bulk Employee Import')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('employees/bulk')
export class BulkImportController {
  constructor(private readonly bulkImportService: BulkImportService) {}

  @Post('preview')
  @Roles(UserRole.COMPANY_ADMIN, UserRole.HR_MANAGER)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
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
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Execute permanent bulk employee onboarding from Excel file' })
  async executeImport(
    @CurrentUser() user: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Excel file is required.');
    return this.bulkImportService.executeImport(user.companyId, file);
  }
}
