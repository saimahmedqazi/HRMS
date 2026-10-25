import { Module } from '@nestjs/common';
import { PrismaModule } from '@common/prisma/prisma.module';
import { MailModule } from '@common/mail/mail.module';
import { AuditLogService } from '@common/services/audit-log.service';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionCronService } from './subscription-cron.service';
import { SubscriptionsController } from './subscriptions.controller';

@Module({
  imports: [PrismaModule, MailModule],
  controllers: [SubscriptionsController],
  providers: [AuditLogService, SubscriptionsService, SubscriptionCronService],
  exports: [SubscriptionsService, AuditLogService],
})
export class SubscriptionsModule {}
