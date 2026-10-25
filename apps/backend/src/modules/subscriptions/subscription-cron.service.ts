import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  AuditAction,
  CompanyStatus,
  NotificationType,
  SubscriptionStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '@common/prisma/prisma.service';
import { MailService } from '@common/mail/mail.service';
import { AuditLogService } from '@common/services/audit-log.service';

@Injectable()
export class SubscriptionCronService {
  private readonly logger = new Logger(SubscriptionCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Daily job at 2:00 AM to process payment renewal retries (Day +1, +2, +3)
   * and 60-day (2-month) non-payment account suspension lockout.
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async handleSubscriptionLifecycle() {
    this.logger.log('Starting daily subscription lifecycle and payment retry cron...');
    await this.processRenewalRetries();
    await this.processNonPaymentLockouts();
    this.logger.log('Daily subscription lifecycle cron finished.');
  }

  /**
   * Process 3-Day Stripe retries (Day +1, +2, +3) and dispatch warnings with exact reasons.
   */
  async processRenewalRetries() {
    const pastDueSubs = await this.prisma.subscription.findMany({
      where: {
        status: SubscriptionStatus.PAST_DUE,
        failedPaymentCount: { lte: 3 },
      },
      include: { company: true },
    });

    for (const sub of pastDueSubs) {
      const reason = sub.lastFailedReason || 'Payment declined by financial institution.';
      const retryDay = sub.failedPaymentCount;

      this.logger.warn(
        `Subscription retry Day +${retryDay} for company ${sub.company.name} (${sub.companyId}). Error: ${reason}`,
      );

      const adminUser = await this.prisma.user.findFirst({
        where: { companyId: sub.companyId, role: UserRole.COMPANY_ADMIN },
      });

      if (adminUser) {
        await this.prisma.notification.create({
          data: {
            companyId: sub.companyId,
            userId: adminUser.id,
            type: NotificationType.SUBSCRIPTION_EXPIRING,
            title: `Payment Failure Retry Notice (Attempt ${retryDay} of 3)`,
            body: `Renewal failed (${reason}). Outstanding payments risk account suspension if unpaid.`,
          },
        });

        await this.mailService.sendMail({
          to: adminUser.email,
          subject: `ZenHR Subscription Renewal Attempt ${retryDay} Failed`,
          html: `<p>Payment attempt ${retryDay} of 3 failed for your ZenHR company subscription. Reason: <strong>${reason}</strong>. Please update your payment card immediately to prevent service interruption.</p>`,
        });
      }
    }
  }

  /**
   * 60-Day (2-Month) Non-Payment Lockout:
   * Companies with unpaid subscriptions older than 60 days are suspended.
   */
  async processNonPaymentLockouts() {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    const delinquentSubs = await this.prisma.subscription.findMany({
      where: {
        status: SubscriptionStatus.PAST_DUE,
        lastFailedPaymentAt: { lte: sixtyDaysAgo },
      },
      include: { company: true },
    });

    for (const sub of delinquentSubs) {
      this.logger.error(
        `Locking out company ${sub.company.name} (${sub.companyId}) due to 60+ days of non-payment.`,
      );

      await this.prisma.$transaction(async (tx) => {
        // Suspend Subscription
        await tx.subscription.update({
          where: { id: sub.id },
          data: {
            status: SubscriptionStatus.SUSPENDED,
            suspendedAt: new Date(),
          },
        });

        // Suspend Company
        await tx.company.update({
          where: { id: sub.companyId },
          data: {
            status: CompanyStatus.SUSPENDED,
          },
        });

        // Audit Trail
        await this.auditLogService.log({
          companyId: sub.companyId,
          action: AuditAction.STATUS_CHANGE,
          entity: 'Company',
          entityId: sub.companyId,
          oldValues: { status: sub.company.status },
          newValues: { status: CompanyStatus.SUSPENDED, reason: 'Suspended (Non-Payment)' },
        });

        // Broadcast notification to admin
        const adminUser = await tx.user.findFirst({
          where: { companyId: sub.companyId, role: UserRole.COMPANY_ADMIN },
        });

        if (adminUser) {
          await tx.notification.create({
            data: {
              companyId: sub.companyId,
              userId: adminUser.id,
              type: NotificationType.SUBSCRIPTION_SUSPENDED,
              title: 'Account Suspended (Non-Payment)',
              body: 'Your account has been locked due to 60 days of unpaid subscription fees. Contact support to restore access.',
            },
          });
        }
      });
    }

    return delinquentSubs.length;
  }
}
