import { Module } from '@nestjs/common';
import { PrismaModule } from '@common/prisma/prisma.module';
import { BulkImportService } from './bulk-import.service';
import { BulkImportController } from './bulk-import.controller';
import { BulkImportJobsService } from './bulk-import-jobs.service';

@Module({
  imports: [PrismaModule],
  controllers: [BulkImportController],
  providers: [BulkImportService, BulkImportJobsService],
  exports: [BulkImportService],
})
export class BulkImportModule {}
