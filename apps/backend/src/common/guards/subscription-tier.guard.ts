import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SubscriptionTier, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '@common/prisma/prisma.service';
import { SUBSCRIPTION_TIER_KEY } from '@common/decorators/require-subscription-tier.decorator';

@Injectable()
export class SubscriptionTierGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredTier = this.reflector.getAllAndOverride<SubscriptionTier>(
      SUBSCRIPTION_TIER_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no subscription tier requirement is specified on the route, allow access
    if (!requiredTier) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.companyId) {
      return true;
    }

    const subscription = await this.prisma.subscription.findUnique({
      where: { companyId: user.companyId },
    });

    // If no subscription record exists yet, default to BASIC
    const currentTier = subscription?.tier || SubscriptionTier.BASIC;
    const currentStatus = subscription?.status || SubscriptionStatus.TRIALING;

    // Check if subscription is suspended
    if (currentStatus === SubscriptionStatus.SUSPENDED) {
      throw new ForbiddenException(
        'Company subscription is suspended due to unpaid invoices. Please update payment method.',
      );
    }

    // If PREMIUM is required, verify tenant is on PREMIUM tier
    if (requiredTier === SubscriptionTier.PREMIUM && currentTier !== SubscriptionTier.PREMIUM) {
      throw new ForbiddenException(
        'This feature is exclusive to ZenHR Premium subscribers. Please upgrade your plan in Billing & Subscriptions.',
      );
    }

    return true;
  }
}
