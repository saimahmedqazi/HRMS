import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { requestContextStorage } from './request-context.storage';

interface JwtPayload {
  sub: string;
  companyId: string | null;
  role: string;
  supportModeCompanyId?: string | null;
  iat?: number;
  exp?: number;
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    const token = req.cookies?.['access_token'] as string | undefined;

    let userId: string | null = null;
    let companyId: string | null = null;
    let role: string | null = null;
    let supportModeCompanyId: string | null = null;

    if (token) {
      try {
        const payload = this.jwtService.verify<JwtPayload>(token, {
          secret: this.configService.get<string>('app.jwt.accessSecret'),
        });
        userId = payload.sub;
        companyId = payload.companyId;
        role = payload.role;
        supportModeCompanyId = payload.supportModeCompanyId ?? null;
      } catch {
        // Token invalid — context remains null (guard will reject if needed)
      }
    }

    const ipAddress =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      null;

    requestContextStorage.run(
      {
        userId,
        companyId,
        role,
        supportModeCompanyId,
        ipAddress,
        userAgent: req.headers['user-agent'] || null,
      },
      () => next(),
    );
  }
}
