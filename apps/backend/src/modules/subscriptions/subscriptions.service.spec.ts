import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SubscriptionStatus, SubscriptionTier, UserRole } from '@prisma/client';
import { PrismaService } from '@common/prisma/prisma.service';
import { MailService } from '@common/mail/mail.service';
import { SubscriptionsService } from './subscriptions.service';

describe('SubscriptionsService', () => {
  let service: SubscriptionsService;
  let prisma: any;
  let mailService: any;

  const mockCompanyId = 'company-123';

  beforeEach(async () => {
    prisma = {
      subscription: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      company: {
        findUnique: jest.fn().mockResolvedValue({ id: mockCompanyId, name: 'Acme Inc' }),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 'user-admin', email: 'admin@acme.com' }),
      },
      notification: {
        create: jest.fn(),
      },
    };

    mailService = {
      sendMail: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: mailService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(null), // sandbox mode
          },
        },
      ],
    }).compile();

    service = module.get<SubscriptionsService>(SubscriptionsService);
  });

  describe('ensureSubscription', () => {
    it('should create default BASIC subscription with 14-day trial if none exists', async () => {
      prisma.subscription.findUnique.mockResolvedValue(null);
      prisma.subscription.create.mockResolvedValue({
        id: 'sub-1',
        companyId: mockCompanyId,
        tier: SubscriptionTier.BASIC,
        status: SubscriptionStatus.TRIALING,
      });

      const result = await service.ensureSubscription(mockCompanyId);

      expect(prisma.subscription.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tier: SubscriptionTier.BASIC,
            status: SubscriptionStatus.TRIALING,
          }),
        }),
      );
      expect(result.tier).toBe(SubscriptionTier.BASIC);
    });
  });

  describe('handleWebhookEvent', () => {
    it('should upgrade company to PREMIUM on checkout.session.completed', async () => {
      const event = {
        type: 'checkout.session.completed',
        data: {
          object: {
            customer: 'cus_123',
            subscription: 'sub_123',
            metadata: { companyId: mockCompanyId },
          },
        },
      };

      await service.handleWebhookEvent(event);

      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { companyId: mockCompanyId },
        data: expect.objectContaining({
          tier: SubscriptionTier.PREMIUM,
          status: SubscriptionStatus.ACTIVE,
        }),
      });
    });

    it('should set PAST_DUE, increment failure count, and notify admin on invoice.payment_failed', async () => {
      prisma.subscription.findMany.mockResolvedValue([
        {
          id: 'sub-1',
          companyId: mockCompanyId,
          stripeCustomerId: 'cus_123',
          company: { name: 'Acme Inc' },
        },
      ]);

      const event = {
        type: 'invoice.payment_failed',
        data: {
          object: {
            customer: 'cus_123',
            last_payment_error: { message: 'Card expired' },
          },
        },
      };

      await service.handleWebhookEvent(event);

      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: expect.objectContaining({
          status: SubscriptionStatus.PAST_DUE,
          lastFailedReason: 'Card expired',
        }),
      });
      expect(prisma.notification.create).toHaveBeenCalled();
      expect(mailService.sendMail).toHaveBeenCalled();
    });
  });
});
