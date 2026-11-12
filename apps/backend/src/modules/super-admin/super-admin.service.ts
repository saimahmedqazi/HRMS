import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CompanyStatus, CompanySuspensionReason, UserRole, AuditAction } from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@Injectable()
export class SuperAdminService {
  private readonly logger = new Logger(SuperAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async listCompanies() {
    const companies = await this.prisma.company.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        subscriptionTier: true,
        createdAt: true,
        subscriptions: {
          select: {
            status: true,
            tier: true,
            currentPeriodStart: true,
            currentPeriodEnd: true,
            trialEnd: true,
          },
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: {
            users: true,
            employees: true,
            departments: true,
          },
        },
      },
    });

    return companies.map((company) => {
      const sub = company.subscriptions?.[0];
      const periodStart = sub?.currentPeriodStart || company.createdAt;
      const periodEnd =
        sub?.currentPeriodEnd ||
        new Date(new Date(periodStart).getTime() + 30 * 24 * 60 * 60 * 1000);
      const trialEnd =
        sub?.trialEnd ||
        new Date(new Date(company.createdAt).getTime() + 14 * 24 * 60 * 60 * 1000);

      return {
        ...company,
        subscriptions: [
          {
            status: sub?.status || 'ACTIVE',
            tier: sub?.tier || company.subscriptionTier,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            trialEnd,
            monthlyAmount: company.subscriptionTier === 'PREMIUM' ? 149 : 49,
          },
        ],
      };
    });
  }

  async getCompanyDetails(id: string) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: {
        users: {
          where: { role: UserRole.COMPANY_ADMIN },
          select: {
            id: true,
            email: true,
            lastLoginAt: true,
            employee: { select: { firstName: true, lastName: true } },
          },
        },
        _count: {
          select: {
            employees: true,
            departments: true,
            teams: true,
          },
        },
      },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    return company;
  }

  async updateCompanyStatus(companyId: string, status: CompanyStatus, adminUser: AuthenticatedUser) {
    return this.prisma.$transaction(async (tx) => {
      const company = await tx.company.findUnique({ where: { id: companyId } });
      if (!company) throw new NotFoundException('Company not found');

      const updated = await tx.company.update({
        where: { id: companyId },
        data: {
          status,
          suspensionReason: status === CompanyStatus.SUSPENDED ? CompanySuspensionReason.MANUAL : null,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: (adminUser.id || adminUser.sub)!,
          action: AuditAction.STATUS_CHANGE,
          entity: 'Company',
          entityId: companyId,
          newValues: {
            previousStatus: company.status,
            newStatus: status,
            updatedBy: adminUser.email,
          },
        },
      });
      return updated;
    });
  }

  async enterSupportMode(companyId: string, reason: string, adminUser: AuthenticatedUser) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Company not found');

    const durationHours = this.configService.get<number>('app.security.supportModeDurationHours', 1);
    const expiresAt = new Date(Date.now() + durationHours * 3600000);
    const superAdminId = (adminUser.id || adminUser.sub)!;

    // Create SupportModeSession record
    const session = await this.prisma.supportModeSession.create({
      data: {
        superAdminId,
        companyId,
        reason,
        expiresAt,
      },
    });

    // Write AuditLog
    await this.prisma.auditLog.create({
      data: {
        userId: superAdminId,
        action: AuditAction.SUPPORT_MODE_ENTER,
        entity: 'Company',
        entityId: companyId,
        newValues: {
          sessionId: session.id,
          reason,
          companyName: company.name,
          expiresAt: expiresAt.toISOString(),
        },
      },
    });

    // Issue updated token carrying supportModeCompanyId
    const accessSecret = this.configService.getOrThrow<string>('app.jwt.accessSecret');
    const token = await this.jwtService.signAsync(
      {
        sub: superAdminId,
        email: adminUser.email,
        role: adminUser.role,
        companyId: null,
        supportModeCompanyId: companyId,
        sessionId: session.id,
        sessionVersion: adminUser.sessionVersion,
      },
      {
        secret: accessSecret,
        expiresIn: `${durationHours}h`,
      },
    );

    return {
      accessToken: token,
      session: {
        id: session.id,
        companyId: company.id,
        companyName: company.name,
        expiresAt,
        reason,
      },
    };
  }

  async exitSupportMode(companyId: string, adminUser: AuthenticatedUser) {
    const superAdminId = (adminUser.id || adminUser.sub)!;

    // End active session if exists
    await this.prisma.supportModeSession.updateMany({
      where: {
        superAdminId,
        companyId,
        endedAt: null,
      },
      data: {
        endedAt: new Date(),
      },
    });

    // Write AuditLog
    await this.prisma.auditLog.create({
      data: {
        userId: superAdminId,
        action: AuditAction.SUPPORT_MODE_EXIT,
        entity: 'Company',
        entityId: companyId,
        newValues: {
          exitedBy: adminUser.email,
        },
      },
    });

    // Issue standard Super Admin token
    const accessSecret = this.configService.getOrThrow<string>('app.jwt.accessSecret');
    const token = await this.jwtService.signAsync(
      {
        sub: superAdminId,
        email: adminUser.email,
        role: adminUser.role,
        companyId: null,
        sessionVersion: adminUser.sessionVersion,
      },
      {
        secret: accessSecret,
        expiresIn: this.configService.get<string>('app.jwt.accessExpiresIn', '15m'),
      },
    );

    return { accessToken: token, message: 'Support mode exited successfully' };
  }

  async getPlatformAnalytics() {
    const [
      totalCompanies,
      activeCompanies,
      totalUsers,
      basicTierCount,
      premiumTierCount,
    ] = await Promise.all([
      this.prisma.company.count(),
      this.prisma.company.count({ where: { status: CompanyStatus.ACTIVE } }),
      this.prisma.user.count(),
      this.prisma.company.count({ where: { subscriptionTier: 'BASIC' } }),
      this.prisma.company.count({ where: { subscriptionTier: 'PREMIUM' } }),
    ]);

    return {
      totalCompanies,
      activeCompanies,
      suspendedCompanies: totalCompanies - activeCompanies,
      totalUsers,
      tierDistribution: {
        basic: basicTierCount,
        premium: premiumTierCount,
      },
      systemHealth: 'HEALTHY',
    };
  }
}
