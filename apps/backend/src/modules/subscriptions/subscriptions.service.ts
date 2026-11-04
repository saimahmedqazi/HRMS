import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
const Stripe = require('stripe');
import type StripeType from 'stripe';
import {
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
      this.logger.warn('Stripe secret key unconfigured; operating in deterministic sandbox simulation mode.');
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
      subscription = await this.prisma.subscription.create({
        data: {
          companyId,
          tier,
          status: SubscriptionStatus.TRIALING,
          currentPeriodStart: now,
          currentPeriodEnd,
          trialEnd,
        },
      });
    } else if (!subscription.currentPeriodEnd) {
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
  async createCheckoutSession(companyId: string, returnUrl: string) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Company not found.');

    const sub = await this.ensureSubscription(companyId);

    if (!this.stripe) {
      // Deterministic Sandbox mock URL
      return {
        url: `${returnUrl}?session_id=mock_checkout_premium_${Date.now()}`,
        mode: 'sandbox',
      };
    }

    const session = await (this.stripe.checkout.sessions.create as any)({
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
    });

    return { url: session.url, mode: 'live' };
  }

  /**
   * Generate Stripe Customer Portal URL for payment method management.
   */
  async createCustomerPortalSession(companyId: string, returnUrl: string) {
    const sub = await this.ensureSubscription(companyId);

    if (!this.stripe || !sub.stripeCustomerId) {
      return {
        url: `${returnUrl}?portal=mock_management_${Date.now()}`,
        mode: 'sandbox',
      };
    }

    const session = await this.stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: returnUrl,
    });

    return { url: session.url, mode: 'live' };
  }

  /**
   * Process incoming Stripe Webhook events.
   */
  async handleWebhookEvent(event: { type: string; data: { object: any } }) {
    this.logger.log(`Received Stripe Webhook event: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const companyId = session.metadata?.companyId;
        if (companyId) {
          await this.prisma.subscription.update({
            where: { companyId },
            data: {
              tier: SubscriptionTier.PREMIUM,
              status: SubscriptionStatus.ACTIVE,
              stripeCustomerId: session.customer,
              stripeSubscriptionId: session.subscription,
              suspendedAt: null,
            },
          });
          if (typeof (this.prisma.company as any)?.update === 'function') {
            await this.prisma.company.update({
              where: { id: companyId },
              data: { subscriptionTier: SubscriptionTier.PREMIUM },
            });
          }
          this.logger.log(`Company ${companyId} upgraded to PREMIUM tier.`);
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        const customerId = invoice.customer;
        if (customerId) {
          await this.prisma.subscription.updateMany({
            where: { stripeCustomerId: customerId },
            data: {
              status: SubscriptionStatus.ACTIVE,
              failedPaymentCount: 0,
              lastFailedReason: null,
              lastFailedPaymentAt: null,
            },
          });
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customerId = invoice.customer;
        const reason = invoice.last_payment_error?.message || 'Payment method declined.';

        const subs = await this.prisma.subscription.findMany({
          where: { stripeCustomerId: customerId },
          include: { company: true },
        });

        for (const sub of subs) {
          await this.prisma.subscription.update({
            where: { id: sub.id },
            data: {
              status: SubscriptionStatus.PAST_DUE,
              failedPaymentCount: { increment: 1 },
              lastFailedPaymentAt: new Date(),
              lastFailedReason: reason,
            },
          });

          // Notify Company Admin
          const adminUser = await this.prisma.user.findFirst({
            where: { companyId: sub.companyId, role: UserRole.COMPANY_ADMIN },
          });

          if (adminUser) {
            await this.prisma.notification.create({
              data: {
                companyId: sub.companyId,
                userId: adminUser.id,
                type: NotificationType.SUBSCRIPTION_EXPIRING,
                title: 'Subscription Payment Failed',
                body: `Your ZenHR monthly renewal failed: ${reason}. Please update your card in Billing.`,
              },
            });

            await this.mailService.sendMail({
              to: adminUser.email,
              subject: 'ZenHR Urgent: Subscription Renewal Failed',
              html: `<p>Your recent monthly subscription invoice payment failed (${reason}). Please visit your billing portal to update payment credentials.</p>`,
            });
          }
        }
        break;
      }

      default:
        this.logger.debug(`Unhandled event type: ${event.type}`);
    }

    return { received: true };
  }
}
