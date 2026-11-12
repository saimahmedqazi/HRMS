import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CompanyStatus, CompanySuspensionReason, SubscriptionStatus, SubscriptionTier } from '@prisma/client';
import { PrismaService } from '@common/prisma/prisma.service';
import { MailService } from '@common/mail/mail.service';
import { SubscriptionsService } from './subscriptions.service';
const Stripe = require('stripe');

describe('SubscriptionsService', () => {
  let service: SubscriptionsService;
  let prisma: any;
  let mailService: any;

  const mockCompanyId = 'company-123';
  const webhookSecret = 'local-test-signing-secret';

  function deliverWebhook(event: object) {
    const payload = JSON.stringify({ id: 'evt_test', created: 1_760_000_000, ...event });
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });
    return service.handleWebhook(Buffer.from(payload), signature);
  }

  beforeEach(async () => {
    prisma = {
      subscription: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      company: {
        findUnique: jest.fn().mockResolvedValue({ id: mockCompanyId, name: 'Acme Inc' }),
        update: jest.fn().mockResolvedValue({ id: mockCompanyId, subscriptionTier: SubscriptionTier.PREMIUM }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      stripeWebhookReceipt: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
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
        SubscriptionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: mailService },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => key === 'app.stripe.webhookSecret' ? webhookSecret : undefined,
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

  describe('handleWebhook', () => {
    it('rejects missing and invalid signatures before processing an event', async () => {
      const payload = Buffer.from(JSON.stringify({ type: 'ping', data: { object: {} } }));
      await expect(service.handleWebhook(payload)).rejects.toThrow('signature is required');
      await expect(service.handleWebhook(payload, 'invalid')).rejects.toThrow('Invalid Stripe webhook signature');
      expect(prisma.subscription.update).not.toHaveBeenCalled();
    });

    it('should upgrade company to PREMIUM on checkout.session.completed', async () => {
      const event = {
        type: 'checkout.session.completed',
        data: {
          object: {
            customer: 'cus_123',
            subscription: 'sub_123',
            mode: 'subscription',
            payment_status: 'paid',
            metadata: { companyId: mockCompanyId },
          },
        },
      };

      await deliverWebhook(event);

      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { companyId: mockCompanyId },
        data: expect.objectContaining({
          tier: SubscriptionTier.PREMIUM,
          status: SubscriptionStatus.ACTIVE,
        }),
      });
      expect(prisma.company.update).toHaveBeenCalledWith({
        where: { id: mockCompanyId },
        data: { subscriptionTier: SubscriptionTier.PREMIUM },
      });
    });

    it('counts and notifies once when Stripe retries a failed-payment event', async () => {
      prisma.stripeWebhookReceipt.createMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });
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
            subscription: 'sub_123',
            last_payment_error: { message: 'Card expired' },
          },
        },
      };

      await deliverWebhook(event);
      await deliverWebhook(event);

      expect(prisma.stripeWebhookReceipt.createMany).toHaveBeenCalledWith({
        data: { id: 'evt_test' },
        skipDuplicates: true,
      });
      expect(prisma.subscription.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({ id: 'sub-1', stripeSubscriptionId: 'sub_123' }),
        data: expect.objectContaining({
          status: SubscriptionStatus.PAST_DUE,
          failedPaymentCount: { increment: 1 },
          lastFailedReason: 'Card expired',
        }),
      });
      expect(prisma.notification.create).toHaveBeenCalledTimes(1);
      expect(mailService.sendMail).toHaveBeenCalledTimes(1);
    });

    it('restores a billing lockout when the active Stripe subscription is paid', async () => {
      prisma.subscription.findMany.mockResolvedValue([{ id: 'sub-1', companyId: mockCompanyId }]);
      prisma.company.updateMany.mockResolvedValueOnce({ count: 1 });

      await deliverWebhook({
        type: 'invoice.payment_succeeded',
        data: { object: {
          customer: 'cus_123',
          parent: { subscription_details: { subscription: 'sub_123' } },
        } },
      });

      expect(prisma.subscription.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { stripeCustomerId: 'cus_123', stripeSubscriptionId: 'sub_123' },
      }));
      expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
        where: { id: 'sub-1', stripeCustomerId: 'cus_123', stripeSubscriptionId: 'sub_123' },
        data: expect.objectContaining({ status: SubscriptionStatus.ACTIVE, suspendedAt: null }),
      });
      expect(prisma.company.updateMany).toHaveBeenCalledWith({
        where: {
          id: mockCompanyId,
          status: CompanyStatus.SUSPENDED,
          suspensionReason: CompanySuspensionReason.NON_PAYMENT,
        },
        data: { status: CompanyStatus.ACTIVE, suspensionReason: null },
      });
      expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    });

    it('ignores checkout completion until the session is paid', async () => {
      await deliverWebhook({
        type: 'checkout.session.completed',
        data: { object: {
          mode: 'subscription', payment_status: 'unpaid',
          customer: 'cus_123', subscription: 'sub_123', metadata: { companyId: mockCompanyId },
        } },
      });
      expect(prisma.subscription.update).not.toHaveBeenCalled();
      expect(prisma.company.update).not.toHaveBeenCalled();
    });
  });
});
