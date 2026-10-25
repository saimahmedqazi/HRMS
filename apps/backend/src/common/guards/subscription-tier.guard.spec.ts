import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SubscriptionTier, SubscriptionStatus } from '@prisma/client';
import { SubscriptionTierGuard } from './subscription-tier.guard';

describe('SubscriptionTierGuard', () => {
  let guard: SubscriptionTierGuard;
  let reflector: any;
  let prisma: any;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    };
    prisma = {
      subscription: {
        findUnique: jest.fn(),
      },
    };
    guard = new SubscriptionTierGuard(reflector as Reflector, prisma);
  });

  function createMockContext(user: any): ExecutionContext {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as any;
  }

  it('should allow access if route has no subscription tier requirement', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const context = createMockContext({ companyId: 'comp-1' });

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('should throw ForbiddenException if route requires PREMIUM but company is on BASIC', async () => {
    reflector.getAllAndOverride.mockReturnValue(SubscriptionTier.PREMIUM);
    prisma.subscription.findUnique.mockResolvedValue({
      tier: SubscriptionTier.BASIC,
      status: SubscriptionStatus.ACTIVE,
    });
    const context = createMockContext({ companyId: 'comp-1' });

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('should allow access if route requires PREMIUM and company is on PREMIUM', async () => {
    reflector.getAllAndOverride.mockReturnValue(SubscriptionTier.PREMIUM);
    prisma.subscription.findUnique.mockResolvedValue({
      tier: SubscriptionTier.PREMIUM,
      status: SubscriptionStatus.ACTIVE,
    });
    const context = createMockContext({ companyId: 'comp-1' });

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('should throw ForbiddenException if company subscription is SUSPENDED', async () => {
    reflector.getAllAndOverride.mockReturnValue(SubscriptionTier.BASIC);
    prisma.subscription.findUnique.mockResolvedValue({
      tier: SubscriptionTier.BASIC,
      status: SubscriptionStatus.SUSPENDED,
    });
    const context = createMockContext({ companyId: 'comp-1' });

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });
});
