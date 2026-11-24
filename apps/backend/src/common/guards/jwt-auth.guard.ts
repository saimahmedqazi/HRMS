import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

const PASSWORD_CHANGE_ALLOWED_PATHS = new Set([
  '/api/v1/auth/me',
  '/api/v1/auth/me/modules',
  '/api/v1/auth/change-password',
  '/api/v1/auth/logout',
  '/api/v1/auth/refresh',
]);

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    return isPublic ? true : super.canActivate(context);
  }

  handleRequest<TUser = any>(err: any, user: any, info: any, context: ExecutionContext): TUser {
    const resolved = super.handleRequest(err, user, info, context);
    if (resolved?.mustChangePassword) {
      const request = context.switchToHttp().getRequest<Request>();
      const path = (request?.originalUrl || request?.url || '').split('?')[0];
      if (!PASSWORD_CHANGE_ALLOWED_PATHS.has(path)) {
        throw new ForbiddenException('You must change your temporary password before accessing this resource.');
      }
    }
    return resolved;
  }
}
