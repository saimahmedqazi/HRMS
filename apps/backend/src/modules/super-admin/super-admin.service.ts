import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CompanyStatus, UserRole, AuditAction } from '@prisma/client';
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
            currentPeriodEnd: true,
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

    return companies;
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
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Company not found');

    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: { status },
    });

    const superAdminId = (adminUser.id || adminUser.sub)!;

    // Write audit log
    await this.prisma.auditLog.create({
      data: {
        userId: superAdminId,
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
    const accessSecret = this.configService.get<string>('app.jwt.accessSecret');
    const token = await this.jwtService.signAsync(
      {
        sub: superAdminId,
        email: adminUser.email,
        role: adminUser.role,
        companyId: null,
        supportModeCompanyId: companyId,
        sessionId: session.id,
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
    const accessSecret = this.configService.get<string>('app.jwt.accessSecret');
    const token = await this.jwtService.signAsync(
      {
        sub: superAdminId,
        email: adminUser.email,
        role: adminUser.role,
        companyId: null,
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
