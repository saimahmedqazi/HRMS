import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export interface AuthenticatedUser {
  id?: string;
  sub?: string;
  email: string;
  role: string;
  companyId?: string | null;
  supportModeCompanyId?: string | null;
  iat?: number;
  exp?: number;
}

/**
 * Extracts the authenticated user from the JWT payload.
 * Must be used after JwtAuthGuard.
 * @example @CurrentUser() user: AuthenticatedUser
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<Request & { user: AuthenticatedUser }>();
    return request.user;
  },
);
