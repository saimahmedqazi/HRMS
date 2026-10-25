import { SetMetadata } from '@nestjs/common';
import { SubscriptionTier } from '@prisma/client';

export const SUBSCRIPTION_TIER_KEY = 'subscriptionTier';
export const RequireSubscriptionTier = (tier: SubscriptionTier) =>
  SetMetadata(SUBSCRIPTION_TIER_KEY, tier);
