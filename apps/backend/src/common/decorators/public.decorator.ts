import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Mark an endpoint as public (skip JwtAuthGuard).
 * @example @Public()
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
