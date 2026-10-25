import { Module } from '@nestjs/common';
import { PrismaModule } from '@common/prisma/prisma.module';
import { StorageModule } from '@common/storage/storage.module';
import { MailModule } from '@common/mail/mail.module';
import { ApprovalEngineService } from './approval-engine.service';
import { LeaveService } from './leave.service';
import { LeaveController } from './leave.controller';

@Module({
  imports: [PrismaModule, StorageModule, MailModule],
  controllers: [LeaveController],
  providers: [ApprovalEngineService, LeaveService],
  exports: [ApprovalEngineService, LeaveService],
})
export class LeaveModule {}
