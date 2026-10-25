import { Module } from '@nestjs/common';
import { PrismaModule } from '@common/prisma/prisma.module';
import { PdfService } from './pdf.service';
import { PayrollService } from './payroll.service';
import { PayrollController } from './payroll.controller';

@Module({
  imports: [PrismaModule],
  controllers: [PayrollController],
  providers: [PdfService, PayrollService],
  exports: [PayrollService, PdfService],
})
export class PayrollModule {}
