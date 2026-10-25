import { Module } from '@nestjs/common';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { DataScopeModule } from '../../common/services/data-scope.module';
import { MailModule } from '../../common/mail/mail.module';
import { StorageModule } from '../../common/storage/storage.module';

@Module({
  imports: [PrismaModule, DataScopeModule, MailModule, StorageModule],
  controllers: [EmployeesController],
  providers: [EmployeesService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
