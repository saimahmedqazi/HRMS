import { Module } from '@nestjs/common';
import { PrismaModule } from '@common/prisma/prisma.module';
import { BulkImportService } from './bulk-import.service';
import { BulkImportController } from './bulk-import.controller';

@Module({
  imports: [PrismaModule],
  controllers: [BulkImportController],
  providers: [BulkImportService],
  exports: [BulkImportService],
})
export class BulkImportModule {}
