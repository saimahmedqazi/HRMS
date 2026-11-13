import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
const Stripe = require('stripe');
import type StripeType from 'stripe';
import {
  AuditAction,
  CompanyStatus,
  CompanySuspensionReason,
  Prisma,
  SubscriptionTier,
  SubscriptionStatus,
  NotificationType,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '@common/prisma/prisma.service';
import { MailService } from '@common/mail/mail.service';

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);
  private stripe: StripeType | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
  ) {
    const stripeKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (stripeKey && !stripeKey.includes('mock')) {
      this.stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' as any });
    } else {
      this.logger.warn(this.configService.get<string>('app.nodeEnv') === 'production'
        ? 'Stripe secret key unconfigured; payment actions are unavailable.'
        : 'Stripe secret key unconfigured; using the local billing simulation.');
    }
  }

  /**
   * Ensure subscription record exists for company.
   */
  async ensureSubscription(companyId: string) {
    let subscription = await this.prisma.subscription.findUnique({
      where: { companyId },
    });

    if (!subscription) {
      const company = await this.prisma.company.findUnique({ where: { id: companyId } });
      const tier = company?.subscriptionTier || SubscriptionTier.BASIC;
      const now = new Date();
      const trialEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
      const currentPeriodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      await this.prisma.subscription.createMany({
        skipDuplicates: true,
        data: {
          companyId,
          tier,
          status: SubscriptionStatus.TRIALING,
          currentPeriodStart: now,
          currentPeriodEnd,
          trialEnd,
        },
      });
      subscription = await this.prisma.subscription.findUniqueOrThrow({ where: { companyId } });
    }
    if (!subscription.currentPeriodEnd) {
      const start = subscription.currentPeriodStart || subscription.createdAt || new Date();
      subscription = {
        ...subscription,
        currentPeriodStart: start,
        currentPeriodEnd: new Date(new Date(start).getTime() + 30 * 24 * 60 * 60 * 1000),
      };
    }

    return subscription;
  }

  /**
   * Get subscription status and features manifest.
   */
  async getSubscription(companyId: string) {
    if (!companyId) {
      const companies =
        typeof (this.prisma.company as any).findMany === 'function'
          ? await this.prisma.company.findMany({
              orderBy: { createdAt: 'desc' },
              include: {
                subscriptions: {
                  take: 1,
                  orderBy: { createdAt: 'desc' },
                },
                _count: {
                  select: { employees: true },
                },
              },
            })
          : [];

      const platformSubscriptions = (companies || []).map((c: any) => {
        const sub = c.subscriptions?.[0];
        const start = sub?.currentPeriodStart || c.createdAt || new Date();
        const end =
          sub?.currentPeriodEnd ||
          new Date(new Date(start).getTime() + 30 * 24 * 60 * 60 * 1000);
        const trialEnd =
          sub?.trialEnd ||
          new Date(new Date(c.createdAt || new Date()).getTime() + 14 * 24 * 60 * 60 * 1000);

        return {
          companyId: c.id,
          companyName: c.name,
          email: c.email,
          tier: sub?.tier || c.subscriptionTier,
          status: sub?.status || 'ACTIVE',
          monthlyAmount: (sub?.tier || c.subscriptionTier) === 'PREMIUM' ? 149 : 49,
          employees: c._count?.employees || 0,
          currentPeriodStart: start,
          currentPeriodEnd: end,
          trialEnd,
        };
      });

      return {
        tier: SubscriptionTier.PREMIUM,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        platformSubscriptions,
        features: {
          workTimer: true,
          aiAssistant: true,
          bulkDataImport: true,
          documentUploads: true,
          maxEmployees: 'Unlimited',
        },
      };
    }

    const sub = await this.ensureSubscription(companyId);
    const isPremium = sub.tier === SubscriptionTier.PREMIUM && sub.status !== SubscriptionStatus.SUSPENDED;

    return {
      ...sub,
      monthlyAmount: sub.tier === SubscriptionTier.PREMIUM ? 149 : 49,
      features: {
        workTimer: isPremium,
        aiAssistant: isPremium,
        bulkDataImport: isPremium,
        documentUploads: isPremium,
        maxEmployees: isPremium ? 'Unlimited' : 25,
      },
    };
  }

  /**
   * Generate Stripe Checkout Session URL for plan upgrade.
   */
  async createCheckoutSession(companyId: string) {
    if (!companyId) throw new BadRequestException('A company account is required to start checkout.');
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Company not found.');

    const returnUrl = this.billingReturnUrl();

    if (!this.stripe) {
      if (this.configService.get<string>('app.nodeEnv') === 'production') {
        throw new ServiceUnavailableException('Stripe checkout is unavailable. Contact your platform administrator.');
      }
      return {
        url: `${returnUrl}?session_id=mock_checkout_premium_${Date.now()}`,
        mode: 'sandbox',
      };
    }

    await this.ensureSubscription(companyId);
    const params: StripeType.Checkout.SessionCreateParams & { payment_method_types: ['card'] } = {
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'ZenHR Premium SaaS Plan',
              description: 'Unlimited workforce, Work Timer alerts, Gemini AI Assistant, & Bulk Excel import.',
            },
            unit_amount: 14900, // $149/mo
            recurring: { interval: 'month' },
          },
          quantity: 1,
        },
      ],
      metadata: { companyId },
      success_url: `${returnUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${returnUrl}?cancelled=true`,
    };
    const session = await this.stripe.checkout.sessions.create(params);

    if (!session.url) throw new ServiceUnavailableException('Stripe did not return a checkout link. Please try again.');
    return { url: session.url, mode: 'live' };
  }

  /**
   * Generate Stripe Customer Portal URL for payment method management.
   */
  async createCustomerPortalSession(companyId: string) {
    if (!companyId) throw new BadRequestException('A company account is required to open the billing portal.');
    const returnUrl = this.billingReturnUrl();

    if (!this.stripe) {
      if (this.configService.get<string>('app.nodeEnv') === 'production') {
        throw new ServiceUnavailableException('The Stripe billing portal is unavailable. Contact your platform administrator.');
      }
      return {
        url: `${returnUrl}?portal=mock_management_${Date.now()}`,
        mode: 'sandbox',
      };
    }

    const sub = await this.ensureSubscription(companyId);
    if (!sub.stripeCustomerId) {
      throw new BadRequestException('The billing portal becomes available once your company has a Stripe billing account.');
    }
    const session = await this.stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: returnUrl,
    });

    return { url: session.url, mode: 'live' };
  }

  private billingReturnUrl(): string {
    return new URL('/dashboard/billing', this.configService.get<string>('app.frontendUrl', 'http://localhost:3000')).href;
  }

  /**
   * Process incoming Stripe Webhook events.
   */
  async handleWebhook(rawBody?: Buffer, signature?: string) {
    const secret = this.configService.get<string>('app.stripe.webhookSecret');
    if (!secret) {
      throw new ServiceUnavailableException('Stripe webhook is not configured.');
    }
    if (!rawBody || !signature) {
      throw new BadRequestException('Stripe webhook signature is required.');
    }

    let event: StripeType.Event;
    try {
      event = Stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch {
      throw new BadRequestException('Invalid Stripe webhook signature.');
    }
    return this.handleWebhookEvent(event);
  }

  private async handleWebhookEvent(event: StripeType.Event) {
    if (
      event.type !== 'checkout.session.completed' &&
      event.type !== 'invoice.payment_succeeded' &&
      event.type !== 'invoice.payment_failed'
    ) return { received: true };

    const recipients = await this.prisma.$transaction(async (tx) => {
      const receipt = await tx.stripeWebhookReceipt.createMany({
        data: { id: event.id },
        skipDuplicates: true,
      });
      if (receipt.count === 0) return [];

      const paid = {
        status: SubscriptionStatus.ACTIVE,
        failedPaymentCount: 0,
        lastFailedReason: null,
        lastFailedPaymentAt: null,
        suspendedAt: null,
      };

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const companyId = session.metadata?.companyId;
        if (
          !companyId || session.mode !== 'subscription' || session.payment_status !== 'paid' ||
          typeof session.customer !== 'string' || typeof session.subscription !== 'string'
        ) return [];

        await tx.subscription.update({
          where: { companyId },
          data: {
            ...paid,
            tier: SubscriptionTier.PREMIUM,
            stripeCustomerId: session.customer,
            stripeSubscriptionId: session.subscription,
          },
        });
        await tx.company.update({
          where: { id: companyId },
          data: { subscriptionTier: SubscriptionTier.PREMIUM },
        });
        await this.restoreBillingLockout(tx, companyId);
        return [];
      }

      const invoice = event.data.object as StripeType.Invoice & {
        subscription?: string | StripeType.Subscription | null;
        last_payment_error?: { message?: string };
      };
      const subscription = invoice.parent?.subscription_details?.subscription ?? invoice.subscription;
      const stripeSubscriptionId = typeof subscription === 'string' ? subscription : subscription?.id;
      const stripeCustomerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
      if (!stripeCustomerId || !stripeSubscriptionId) return [];

      const subscriptions = await tx.subscription.findMany({
        where: { stripeCustomerId, stripeSubscriptionId },
        select: { id: true, companyId: true },
      });
      const emails: string[] = [];
      for (const sub of subscriptions) {
        const where = { id: sub.id, stripeCustomerId, stripeSubscriptionId };
        if (event.type === 'invoice.payment_succeeded') {
          const updated = await tx.subscription.updateMany({ where, data: paid });
          if (updated.count > 0) await this.restoreBillingLockout(tx, sub.companyId);
          continue;
        }

        const reason = invoice.last_payment_error?.message || 'Payment method declined.';
        const updated = await tx.subscription.updateMany({
          where: { ...where, status: { in: [
            SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING, SubscriptionStatus.PAST_DUE,
          ] } },
          data: {
            status: SubscriptionStatus.PAST_DUE,
            failedPaymentCount: { increment: 1 },
            lastFailedPaymentAt: new Date(event.created * 1000),
            lastFailedReason: reason,
          },
        });
        if (updated.count === 0) continue;

        const admin = await tx.user.findFirst({
          where: { companyId: sub.companyId, role: UserRole.COMPANY_ADMIN },
          select: { id: true, email: true },
        });
        if (!admin) continue;

        await tx.notification.create({
          data: {
            companyId: sub.companyId,
            userId: admin.id,
            type: NotificationType.SUBSCRIPTION_EXPIRING,
            title: 'Subscription Payment Failed',
            body: `Your ZenHR monthly renewal failed: ${reason}. Please update your card in Billing.`,
          },
        });
        emails.push(admin.email);
      }
      return emails;
    });

    for (const to of recipients) {
      await this.mailService.sendMail({
        to,
        subject: 'ZenHR Urgent: Subscription Renewal Failed',
        html: '<p>Your recent monthly subscription invoice payment failed. Please visit your billing portal to update payment credentials.</p>',
      });
    }
    return { received: true };
  }

  private async restoreBillingLockout(tx: Prisma.TransactionClient, companyId: string) {
    const restored = await tx.company.updateMany({
      where: { id: companyId, status: CompanyStatus.SUSPENDED, suspensionReason: CompanySuspensionReason.NON_PAYMENT },
      data: { status: CompanyStatus.ACTIVE, suspensionReason: null },
    });
    if (restored.count === 0) return;

    await tx.auditLog.create({
      data: {
        companyId,
        action: AuditAction.STATUS_CHANGE,
        entity: 'Company',
        entityId: companyId,
        oldValues: { status: CompanyStatus.SUSPENDED },
        newValues: { status: CompanyStatus.ACTIVE, reason: 'Payment received' },
      },
    });
  }
}
