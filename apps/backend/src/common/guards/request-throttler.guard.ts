import { Injectable, SetMetadata, type ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { requestContextStorage } from '../request-context/request-context.storage';

type SessionCookie = 'access_token' | 'refresh_token';
const SESSION_PROBE_COOKIE = Symbol('sessionProbeCookie');
export const SessionProbe = (cookie: SessionCookie) => SetMetadata(SESSION_PROBE_COOKIE, cookie);

@Injectable()
export class RequestThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const cookie = this.reflector.get<SessionCookie>(SESSION_PROBE_COOKIE, context.getHandler());
    if (cookie === 'access_token') return !requestContextStorage.getStore()?.userId;
    if (cookie === 'refresh_token') return !context.switchToHttp().getRequest<Request>().cookies?.[cookie];
    return false;
  }

  protected async getTracker(request: Record<string, unknown>, context?: ExecutionContext): Promise<string> {
    const identity = requestContextStorage.getStore();
    if (context && identity?.userId && identity.role) {
      const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (!isPublic) return `user:${identity.userId}`;
    }
    return super.getTracker(request);
  }
}
