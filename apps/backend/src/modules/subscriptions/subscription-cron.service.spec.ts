import { Test, TestingModule } from '@nestjs/testing';
import { CompanyStatus, CompanySuspensionReason, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '@common/prisma/prisma.service';
import { MailService } from '@common/mail/mail.service';
import { SubscriptionCronService } from './subscription-cron.service';

describe('SubscriptionCronService', () => {
  let service: SubscriptionCronService;
  let prisma: any;
  let mailService: any;

  const mockCompanyId = 'company-123';

  beforeEach(async () => {
    prisma = {
      subscription: {
        findMany: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      company: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: { create: jest.fn() },
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 'user-admin', email: 'admin@acme.com' }),
      },
      notification: {
        create: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(prisma)),
    };

    mailService = {
      sendMail: jest.fn().mockResolvedValue(true),
    };


    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionCronService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: mailService },
      ],
    }).compile();

    service = module.get<SubscriptionCronService>(SubscriptionCronService);
  });

  describe('processRenewalRetries', () => {
    it('should dispatch retry notices to company admin for past due subscriptions', async () => {
      prisma.subscription.findMany.mockResolvedValue([
        {
          id: 'sub-1',
          companyId: mockCompanyId,
          failedPaymentCount: 2,
          lastFailedPaymentAt: new Date('2026-11-10T00:00:00Z'),
          lastFailedReason: 'Insufficient funds',
          company: { name: 'Acme Inc' },
        },
      ]);

      await service.processRenewalRetries();

      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: expect.stringContaining('Attempt 2 of 3'),
          }),
        }),
      );
      expect(mailService.sendMail).toHaveBeenCalled();
    });

    it('sends no duplicate notice when the same retry was already claimed', async () => {
      const failedAt = new Date('2026-11-10T00:00:00Z');
      prisma.subscription.findMany.mockResolvedValue([
        { id: 'sub-1', companyId: mockCompanyId, failedPaymentCount: 2, lastFailedPaymentAt: failedAt },
      ]);
      prisma.subscription.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

      await service.processRenewalRetries();
      await service.processRenewalRetries();

      expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
        where: { id: 'sub-1', status: SubscriptionStatus.PAST_DUE, failedPaymentCount: 2,
          lastFailedPaymentAt: failedAt, lastNotifiedRetry: { lt: 2 } },
        data: { lastNotifiedRetry: 2 },
      });
      expect(prisma.notification.create).toHaveBeenCalledTimes(1);
      expect(mailService.sendMail).toHaveBeenCalledTimes(1);
    });
  });

  describe('processNonPaymentLockouts', () => {
    it('should suspend company and subscription if payment remains unpaid after 60 days', async () => {
      const delinquentDate = new Date(Date.now() - 65 * 24 * 60 * 60 * 1000); // 65 days ago
      prisma.subscription.findMany.mockResolvedValue([
        {
          id: 'sub-1',
          companyId: mockCompanyId,
          status: SubscriptionStatus.PAST_DUE,
          unpaidSince: delinquentDate,
          lastFailedPaymentAt: new Date(),
          company: { id: mockCompanyId, name: 'Acme Inc', status: CompanyStatus.ACTIVE },
        },
      ]);

      const count = await service.processNonPaymentLockouts();

      expect(count).toBe(1);
      expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'sub-1',
          status: SubscriptionStatus.PAST_DUE,
          unpaidSince: { lte: expect.any(Date) },
        },
        data: expect.objectContaining({
          status: SubscriptionStatus.SUSPENDED,
        }),
      });
      expect(prisma.company.updateMany).toHaveBeenCalledWith({
        where: { id: mockCompanyId, status: CompanyStatus.ACTIVE },
        data: { status: CompanyStatus.SUSPENDED, suspensionReason: CompanySuspensionReason.NON_PAYMENT },
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'STATUS_CHANGE',
          entity: 'Company',
        }),
      });
    });

    it('skips a subscription that was paid after the initial delinquency scan', async () => {
      prisma.subscription.findMany.mockResolvedValue([{ id: 'sub-1', companyId: mockCompanyId }]);
      prisma.subscription.updateMany.mockResolvedValueOnce({ count: 0 });
      await expect(service.processNonPaymentLockouts()).resolves.toBe(0);
      expect(prisma.company.updateMany).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });
  });
});
