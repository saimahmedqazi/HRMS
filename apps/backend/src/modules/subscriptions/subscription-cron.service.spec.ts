import { Test, TestingModule } from '@nestjs/testing';
import { CompanyStatus, SubscriptionStatus, UserRole } from '@prisma/client';
import { PrismaService } from '@common/prisma/prisma.service';
import { MailService } from '@common/mail/mail.service';
import { AuditLogService } from '@common/services/audit-log.service';
import { SubscriptionCronService } from './subscription-cron.service';

describe('SubscriptionCronService', () => {
  let service: SubscriptionCronService;
  let prisma: any;
  let mailService: any;
  let auditLogService: any;

  const mockCompanyId = 'company-123';

  beforeEach(async () => {
    prisma = {
      subscription: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
      company: {
        update: jest.fn(),
      },
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

    auditLogService = {
      log: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionCronService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: mailService },
        { provide: AuditLogService, useValue: auditLogService },
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
  });

  describe('processNonPaymentLockouts', () => {
    it('should suspend company and subscription if payment remains unpaid after 60 days', async () => {
      const delinquentDate = new Date(Date.now() - 65 * 24 * 60 * 60 * 1000); // 65 days ago
      prisma.subscription.findMany.mockResolvedValue([
        {
          id: 'sub-1',
          companyId: mockCompanyId,
          status: SubscriptionStatus.PAST_DUE,
          lastFailedPaymentAt: delinquentDate,
          company: { id: mockCompanyId, name: 'Acme Inc', status: CompanyStatus.ACTIVE },
        },
      ]);

      const count = await service.processNonPaymentLockouts();

      expect(count).toBe(1);
      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: expect.objectContaining({
          status: SubscriptionStatus.SUSPENDED,
        }),
      });
      expect(prisma.company.update).toHaveBeenCalledWith({
        where: { id: mockCompanyId },
        data: { status: CompanyStatus.SUSPENDED },
      });
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'STATUS_CHANGE',
          entity: 'Company',
        }),
      );
    });
  });
});
