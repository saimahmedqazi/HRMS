import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { Request } from 'express';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { isInactiveAccount } from '../account-state';
import { PASSWORD_SETUP_REQUIRED } from '../../../common/utils/password-policy';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  companyId: string | null;
  supportModeCompanyId?: string | null;
  sessionId?: string;
  sessionVersion?: number;
  is2faTemp?: boolean;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => {
          const token = request?.cookies?.['access_token'];
          return token || null;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('app.jwt.accessSecret'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (payload.is2faTemp || !payload.sub || !payload.role || !Number.isFinite(payload.exp)) {
      throw new UnauthorizedException('Invalid access session');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        companyId: true,
        role: true,
        deletedAt: true,
        sessionVersion: true,
        passwordHash: true,
        company: { select: { status: true } },
        employee: { select: { status: true, deletedAt: true } },
      },
    });

    if (!user || isInactiveAccount(user)) {
      throw new UnauthorizedException('User account or company inactive or suspended');
    }
    if (user.passwordHash === PASSWORD_SETUP_REQUIRED || (payload.sessionVersion ?? 0) !== user.sessionVersion) {
      throw new UnauthorizedException('Session expired');
    }

    const platformRole = user.role === UserRole.SUPER_ADMIN || user.role === UserRole.OPERATION_MANAGER;
    if (user.role !== payload.role || user.companyId !== payload.companyId ||
        (platformRole ? user.companyId !== null : !user.companyId)) {
      throw new UnauthorizedException('Account permissions have changed');
    }

    if (payload.supportModeCompanyId) {
      if (user.role !== UserRole.SUPER_ADMIN || !payload.sessionId) {
        throw new UnauthorizedException('Invalid support session');
      }
      const session = await this.prisma.supportModeSession.findFirst({
        where: {
          id: payload.sessionId,
          superAdminId: user.id,
          companyId: payload.supportModeCompanyId,
          endedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      });
      if (!session) {
        throw new UnauthorizedException('Support session has ended');
      }
    }

    return {
      id: user.id,
      sub: user.id,
      email: user.email,
      role: user.role,
      companyId: payload.supportModeCompanyId || user.companyId,
      supportModeCompanyId: payload.supportModeCompanyId,
      ...(payload.supportModeCompanyId && { supportModeSessionId: payload.sessionId }),
      sessionVersion: user.sessionVersion,
      iat: payload.iat,
      exp: payload.exp,
    };
  }
}
