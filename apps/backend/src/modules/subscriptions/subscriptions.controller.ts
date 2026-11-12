import {
  Controller,
  Get,
  Post,
  Body,
  Headers,
  HttpCode,
  RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { Public } from '@common/decorators/public.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { SubscriptionsService } from './subscriptions.service';

@ApiTags('Subscriptions & Billing')
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('current')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Get current company subscription tier and feature matrix' })
  async getCurrentSubscription(@CurrentUser() user: any) {
    return this.subscriptionsService.getSubscription(user.companyId);
  }

  @Post('checkout-session')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.COMPANY_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create Stripe Checkout session for upgrading to Premium' })
  async createCheckoutSession(
    @CurrentUser() user: any,
    @Body('returnUrl') returnUrl: string,
  ) {
    const targetUrl = returnUrl || 'http://localhost:3000/dashboard/billing';
    return this.subscriptionsService.createCheckoutSession(user.companyId, targetUrl);
  }

  @Post('portal-session')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.COMPANY_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create Stripe Customer Portal session for billing management' })
  async createCustomerPortalSession(
    @CurrentUser() user: any,
    @Body('returnUrl') returnUrl: string,
  ) {
    const targetUrl = returnUrl || 'http://localhost:3000/dashboard/billing';
    return this.subscriptionsService.createCustomerPortalSession(user.companyId, targetUrl);
  }

  @Public()
  @Post('webhook')
  @SkipThrottle({ short: true, long: true })
  @HttpCode(200)
  @ApiOperation({ summary: 'Handle Stripe webhook notifications' })
  async handleWebhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ) {
    return this.subscriptionsService.handleWebhook(request.rawBody, signature);
  }
}
