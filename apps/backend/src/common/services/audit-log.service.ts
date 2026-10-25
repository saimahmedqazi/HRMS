import { Injectable, Logger } from '@nestjs/common';
import { AuditAction } from '@prisma/client';
import { PrismaService } from '@common/prisma/prisma.service';

export interface RecordAuditOptions {
  companyId?: string | null;
  userId?: string | null;
  action: AuditAction;
  entity?: string;
  entityId?: string;
  oldValues?: any;
  newValues?: any;
  ipAddress?: string;
  userAgent?: string;
  isSupportMode?: boolean;
  supportSessionId?: string;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record a security audit event into the immutable audit_logs table.
   */
  async log(options: RecordAuditOptions) {
    try {
      return await this.prisma.auditLog.create({
        data: {
          companyId: options.companyId,
          userId: options.userId,
          action: options.action,
          entity: options.entity,
          entityId: options.entityId,
          oldValues: options.oldValues,
          newValues: options.newValues,
          ipAddress: options.ipAddress,
          userAgent: options.userAgent,
          isSupportMode: options.isSupportMode ?? false,
          supportSessionId: options.supportSessionId,
        },
      });
    } catch (err: any) {
      this.logger.error(`Failed to record audit log: ${err.message}`, err.stack);
      return null;
    }
  }

  /**
   * Scoped query of security audit logs.
   */
  async getLogs(companyId?: string, limit: number = 50) {
    return this.prisma.auditLog.findMany({
      where: companyId ? { companyId } : {},
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: {
          select: {
            email: true,
            role: true,
          },
        },
      },
    });
  }
}
