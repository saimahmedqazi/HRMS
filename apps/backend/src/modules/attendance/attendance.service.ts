import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { getCompanyAttendanceTime } from '../../common/utils/attendance-date';
import { findCurrentPunch, resolveEmployeeAttendanceDay, shiftStandardMinutes } from '../../common/utils/attendance-shift';
import { normalizeIpAddress } from '../../common/utils/request-ip';
import { rethrowMissingRecordAsConflict } from '../../common/utils/prisma-conflict';
import { DataScopeService } from '../../common/services/data-scope.service';
import { MailService } from '../../common/mail/mail.service';
import { AttendanceGateway } from './attendance.gateway';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import {
  UserRole,
  AttendanceStatus,
  RemoteWorkStatus,
  TimerStatus,
  NotificationType,
  Prisma,
} from '@prisma/client';
import * as geoip from 'geoip-lite';
import { CheckInDto } from './dto/check-in.dto';
import { CheckOutDto } from './dto/check-out.dto';
import { CreateRemotePermissionDto } from './dto/create-remote-permission.dto';
import { ResolveExceptionDto } from './dto/resolve-exception.dto';

export interface AttendanceFilter {
  startDate?: string;
  endDate?: string;
  departmentId?: string;
  employeeId?: string;
  status?: AttendanceStatus;
  page?: number;
  limit?: number;
}

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dataScopeService: DataScopeService,
    private readonly mailService: MailService,
    private readonly gateway: AttendanceGateway,
  ) {}

  private getEffectiveCompanyId(user: AuthenticatedUser): string {
    const companyId = user.supportModeCompanyId || user.companyId;
    if (!companyId) throw new ForbiddenException('Company context required');
    return companyId;
  }

  async checkIn(dto: CheckInDto, ip: string | null, user: AuthenticatedUser) {
    const companyId = this.getEffectiveCompanyId(user);
    const userId = (user.id || user.sub)!;

    const employee = await this.prisma.employee.findFirst({
      where: { userId, companyId, deletedAt: null },
      include: {
        department: true,
        reportingManager: { select: { id: true, userId: true, user: { select: { email: true } } } },
      },
    });

    if (!employee) throw new NotFoundException('Employee profile not found');

    const checkInTime = new Date();
    const scope = { companyId, employeeId: employee.id };
    const local = await getCompanyAttendanceTime(this.prisma, companyId, checkInTime);
    const dates = await resolveEmployeeAttendanceDay(this.prisma, scope, checkInTime, local);
    const shiftDate = dates.date;
    const cleanIp = normalizeIpAddress(ip ?? undefined);
    let status: AttendanceStatus = AttendanceStatus.PRESENT;

    // Check HR IP Whitelist for Office & Remote/Hybrid employees
    const whitelist = await this.prisma.ipWhitelist.findMany({ where: { companyId } });
    const isIpWhitelisted = cleanIp !== null && whitelist.some(
      (entry) => entry.ipAddress === cleanIp || entry.ipAddress === '*',
    );

    // Check for approved standing remote work permission covering the shift.
    const permission = await this.prisma.remoteWorkPermission.findFirst({
      where: {
        companyId,
        employeeId: employee.id,
        status: RemoteWorkStatus.APPROVED,
        startDate: { lte: shiftDate },
        endDate: { gte: shiftDate },
      },
    });

    if (dto.isRemote) {
      if (isIpWhitelisted || permission) {
        status = AttendanceStatus.PRESENT_REMOTE;
      } else {
        // Unauthorized remote check-in -> route to HR Exceptions Queue
        status = AttendanceStatus.ABSENT_PENDING_REVIEW;
      }
    } else if (whitelist.length > 0 && !isIpWhitelisted) {
      // Office IP restriction active: employee attempted onsite punch from non-whitelisted IP
      status = permission
        ? AttendanceStatus.PRESENT_REMOTE
        : AttendanceStatus.ABSENT_PENDING_REVIEW;
    }

    const attendanceKey = { ...scope, date: shiftDate };
    const record = await this.prisma.$transaction(async (tx) => {
      const existing = await findCurrentPunch(tx, scope, dates);
      if (existing?.checkInTime) {
        throw new ConflictException(
          existing.date.getTime() === shiftDate.getTime()
            ? 'You have already checked in for this shift'
            : 'Check out of your previous shift before starting a new one',
        );
      }

      let checkInLocation: string | null = null;
      if (typeof dto.latitude === 'number' && typeof dto.longitude === 'number') {
        const preference = await tx.employee.findFirst({
          where: { id: employee.id, companyId, userId, deletedAt: null },
          select: { locationConsent: true },
        });
        if (preference?.locationConsent) {
          checkInLocation = JSON.stringify({
            lat: dto.latitude,
            lng: dto.longitude,
            whitelisted: isIpWhitelisted,
          });
        }
      }
      await tx.attendanceRecord.createMany({ data: attendanceKey, skipDuplicates: true });
      return tx.attendanceRecord.update({
        where: { companyId_employeeId_date: attendanceKey, checkInTime: null },
        data: {
          checkInTime,
          status,
          isRemote: dto.isRemote,
          checkInIp: cleanIp,
          checkInLocation,
          notes: dto.notes,
          markedBySystem: false,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2025', 'P2034'].includes(error.code)) {
        throw new ConflictException('The attendance record changed. Refresh it before trying again.');
      }
      throw error;
    });

    // If routed to HR Exceptions Queue, broadcast alert
    if (status === AttendanceStatus.ABSENT_PENDING_REVIEW) {
      const payload = {
        attendanceId: record.id,
        employeeId: employee.id,
        employeeName: `${employee.firstName} ${employee.lastName}`,
        date: shiftDate.toISOString(),
        checkInTime: checkInTime.toISOString(),
        ipAddress: cleanIp ?? undefined,
        timestamp: new Date().toISOString(),
      };

      this.gateway.broadcastAttendanceException(companyId, payload);

      // Create in-app notification for HR
      const hrUsers = await this.prisma.user.findMany({
        where: { companyId, role: UserRole.HR_MANAGER },
        select: { id: true, email: true },
      });

      for (const hr of hrUsers) {
        await this.prisma.notification.create({
          data: {
            companyId,
            userId: hr.id,
            type: NotificationType.ATTENDANCE_EXCEPTION,
            title: 'Unauthorized Remote Check-in Exception',
            body: `${employee.firstName} ${employee.lastName} performed an unauthorized remote check-in. Review required.`,
            data: { attendanceId: record.id, employeeId: employee.id },
          },
        });

        // Email alert
        await this.mailService.sendMail({
          to: hr.email,
          subject: 'Attendance Exception: Unauthorized Remote Check-in',
          html: `
            <p><strong>Employee:</strong> ${employee.firstName} ${employee.lastName} (${employee.employeeCode})</p>
            <p><strong>Check-in Time:</strong> ${checkInTime.toLocaleTimeString()}</p>
            <p><strong>Status:</strong> Routed to HR Exceptions Queue pending review.</p>
          `,
        });
      }
    }

    return record;
  }

  async checkOut(dto: CheckOutDto, user: AuthenticatedUser) {
    const companyId = this.getEffectiveCompanyId(user);
    const userId = (user.id || user.sub)!;

    const employee = await this.prisma.employee.findFirst({
      where: { userId, companyId, deletedAt: null },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    const checkOutTime = new Date();
    const scope = { companyId, employeeId: employee.id };
    const local = await getCompanyAttendanceTime(this.prisma, companyId, checkOutTime);
    const dates = await resolveEmployeeAttendanceDay(this.prisma, scope, checkOutTime, local);
    const record = await findCurrentPunch(this.prisma, scope, dates);

    if (!record || !record.checkInTime) {
      throw new BadRequestException('You have not checked in for this shift');
    }
    if (record.checkOutTime) {
      throw new BadRequestException('You have already checked out for this shift');
    }

    const completedTimer = await this.prisma.workTimerEntry.findFirst({
      where: { ...scope, date: record.date, status: TimerStatus.STOPPED },
      select: { totalMinutes: true },
    });
    const elapsedMinutes = Math.round((checkOutTime.getTime() - record.checkInTime.getTime()) / 60000);
    const totalMinutes = completedTimer?.totalMinutes ?? Math.max(0, elapsedMinutes);
    const overtimeMinutes = Math.max(0, totalMinutes - shiftStandardMinutes(dates.shift));

    return this.prisma.attendanceRecord.update({
      where: { id: record.id, companyId, checkOutTime: null },
      data: {
        checkOutTime,
        workMinutes: totalMinutes,
        overtimeMinutes,
        notes: dto.notes ? `${record.notes || ''} | Checkout: ${dto.notes}`.trim() : record.notes,
      },
    }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new ConflictException('The attendance record changed. Refresh it before trying again.');
      }
      throw error;
    });
  }

  async getTodayStatus(user: AuthenticatedUser) {
    const companyId = this.getEffectiveCompanyId(user);
    const userId = (user.id || user.sub)!;

    const employee = await this.prisma.employee.findFirst({
      where: { userId, companyId, deletedAt: null },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    const now = new Date();
    const scope = { companyId, employeeId: employee.id };
    const local = await getCompanyAttendanceTime(this.prisma, companyId, now);
    const dates = await resolveEmployeeAttendanceDay(this.prisma, scope, now, local);
    const record = await findCurrentPunch(this.prisma, scope, dates);
    return record ?? { status: null, checkedIn: false, date: dates.date };
  }

  async listAttendanceRecords(user: AuthenticatedUser, filter: AttendanceFilter = {}) {
    const companyId = this.getEffectiveCompanyId(user);
    const scopeFilter = await this.dataScopeService.resolveEmployeeScope(this.prisma, companyId, user);

    const whereClause: any = {
      companyId,
      ...(filter.employeeId ? { employeeId: filter.employeeId } : {}),
      ...(scopeFilter.id ? { employeeId: scopeFilter.id } : {}),
      ...(scopeFilter.departmentId || scopeFilter.teamId || filter.departmentId
        ? {
            employee: {
              ...(filter.departmentId ? { departmentId: filter.departmentId } : {}),
              ...(scopeFilter.departmentId ? { departmentId: scopeFilter.departmentId } : {}),
              ...(scopeFilter.teamId ? { teamId: scopeFilter.teamId } : {}),
            },
          }
        : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.startDate || filter.endDate
        ? {
            date: {
              ...(filter.startDate ? { gte: new Date(filter.startDate) } : {}),
              ...(filter.endDate ? { lte: new Date(filter.endDate) } : {}),
            },
          }
        : {}),
    };

    return this.prisma.attendanceRecord.findMany({
      where: whereClause,
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            profilePictureUrl: true,
            department: { select: { id: true, name: true } },
            designation: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { date: 'desc' },
    });
  }

  async listExceptions(user: AuthenticatedUser) {
    const companyId = this.getEffectiveCompanyId(user);

    return this.prisma.attendanceRecord.findMany({
      where: {
        companyId,
        status: AttendanceStatus.ABSENT_PENDING_REVIEW,
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            profilePictureUrl: true,
            department: { select: { id: true, name: true } },
            reportingManager: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { checkInTime: 'desc' },
    });
  }

  async resolveException(
    id: string,
    dto: ResolveExceptionDto,
    user: AuthenticatedUser,
  ) {
    const companyId = this.getEffectiveCompanyId(user);

    const record = await this.prisma.attendanceRecord.findFirst({
      where: { id, companyId },
      select: { date: true, status: true, notes: true, employee: { select: { userId: true } } },
    });
    if (!record) throw new NotFoundException('Attendance record not found');
    const conflictMessage = 'This attendance exception is no longer pending review.';
    if (record.status !== AttendanceStatus.ABSENT_PENDING_REVIEW) {
      throw new ConflictException(conflictMessage);
    }

    const approved = dto.action === 'APPROVE';
    const status = approved ? AttendanceStatus.PRESENT_REMOTE : AttendanceStatus.ABSENT;
    const decision = approved ? 'approved' : 'rejected';

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.attendanceRecord.update({
        where: { id, companyId, status: AttendanceStatus.ABSENT_PENDING_REVIEW },
        data: {
          status,
          notes: dto.notes
            ? [record.notes, `HR Resolution: ${dto.action} (${dto.notes})`].filter(Boolean).join(' | ')
            : undefined,
        },
      }).catch((error: unknown) => rethrowMissingRecordAsConflict(error, conflictMessage));

      await tx.notification.create({
        data: {
          companyId,
          userId: record.employee.userId,
          type: NotificationType.ATTENDANCE_EXCEPTION,
          title: `Remote Check-in Exception ${approved ? 'Approved' : 'Rejected'}`,
          body: `Your remote check-in for ${record.date.toDateString()} was ${decision} by HR.`,
          data: { attendanceId: id, status },
        },
      });

      return updated;
    });
  }

  // Remote Work Permissions
  async createRemotePermission(dto: CreateRemotePermissionDto, user: AuthenticatedUser) {
    const companyId = this.getEffectiveCompanyId(user);
    const userId = (user.id || user.sub)!;

    if (new Date(dto.endDate) < new Date(dto.startDate)) {
      throw new BadRequestException('End date cannot be earlier than start date');
    }

    const employee = await this.prisma.employee.findFirst({
      where: { userId, companyId, deletedAt: null },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    return this.prisma.remoteWorkPermission.create({
      data: {
        companyId,
        employeeId: employee.id,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        reason: dto.reason,
        status: RemoteWorkStatus.PENDING,
      },
    });
  }

  async listRemotePermissions(user: AuthenticatedUser) {
    const companyId = this.getEffectiveCompanyId(user);
    const scope = await this.dataScopeService.resolveEmployeeScope(this.prisma, companyId, user);

    return this.prisma.remoteWorkPermission.findMany({
      where: {
        companyId,
        employee: scope,
      },
      include: {
        employee: {
          select: {
            id: true,
            userId: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async approvePermissionStep1(id: string, user: AuthenticatedUser) {
    const companyId = this.getEffectiveCompanyId(user);
    const userId = (user.id || user.sub)!;

    const permission = await this.prisma.remoteWorkPermission.findFirst({
      where: { id, companyId, employee: { companyId, deletedAt: null } },
      include: {
        employee: {
          select: {
            userId: true,
            teamId: true,
            reportingManager: { select: { userId: true, companyId: true } },
          },
        },
      },
    });
    if (!permission) throw new NotFoundException('Permission request not found');
    if (permission.status !== RemoteWorkStatus.PENDING || permission.step1ApprovedAt) {
      throw new ConflictException('Step 1 is no longer pending');
    }
    if (permission.employee.userId === userId) {
      throw new ForbiddenException('You cannot approve your own remote work request');
    }
    if (user.role === UserRole.TEAM_LEAD) {
      const scope = await this.dataScopeService.resolveEmployeeScope(this.prisma, companyId, user);
      const manager = permission.employee.reportingManager;
      const isDirectManager = manager?.userId === userId && manager.companyId === companyId;
      if (!isDirectManager && (!scope.teamId || scope.teamId !== permission.employee.teamId)) {
        throw new ForbiddenException('You can only recommend requests within your team or reporting line');
      }
    }

    return this.prisma.remoteWorkPermission.update({
      where: { id, companyId, status: RemoteWorkStatus.PENDING, step1ApprovedAt: null },
      data: {
        step1ApproverId: userId,
        step1ApprovedAt: new Date(),
      },
    }).catch((error: unknown) => rethrowMissingRecordAsConflict(error, 'Step 1 is no longer pending'));
  }

  async approvePermissionStep2(id: string, user: AuthenticatedUser) {
    const companyId = this.getEffectiveCompanyId(user);
    const userId = (user.id || user.sub)!;

    const permission = await this.prisma.remoteWorkPermission.findFirst({
      where: { id, companyId, employee: { companyId, deletedAt: null } },
      include: { employee: { select: { userId: true, departmentId: true } } },
    });
    if (!permission) throw new NotFoundException('Permission request not found');
    if (permission.status !== RemoteWorkStatus.PENDING) {
      throw new ConflictException('Step 2 is no longer pending');
    }
    if (!permission.step1ApprovedAt) {
      throw new BadRequestException('Step 2 requires Step 1 to be completed');
    }
    if (permission.employee.userId === userId) {
      throw new ForbiddenException('You cannot approve your own remote work request');
    }
    if (user.role === UserRole.DEPARTMENT_MANAGER) {
      const scope = await this.dataScopeService.resolveEmployeeScope(this.prisma, companyId, user);
      if (!scope.departmentId || scope.departmentId !== permission.employee.departmentId) {
        throw new ForbiddenException('You can only approve requests within your department');
      }
    }

    return this.prisma.remoteWorkPermission.update({
      where: { id, companyId, status: RemoteWorkStatus.PENDING, step1ApprovedAt: { not: null } },
      data: {
        step2ApproverId: userId,
        step2ApprovedAt: new Date(),
        status: RemoteWorkStatus.APPROVED,
      },
    }).catch((error: unknown) => rethrowMissingRecordAsConflict(error, 'Step 2 is no longer pending'));
  }

  // HR IP Whitelist Management (Office & Remote/Hybrid WFH IPs)
  async listIpWhitelist(user: AuthenticatedUser, currentIp: string | null) {
    const companyId = this.getEffectiveCompanyId(user);
    const cleanIp = normalizeIpAddress(currentIp ?? undefined);
    const geo = cleanIp ? geoip.lookup(cleanIp) : null;

    const items = await this.prisma.ipWhitelist.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });

    const isCurrentIpWhitelisted = cleanIp !== null && items.some(
      (item) => item.ipAddress === cleanIp || item.ipAddress === '*',
    );

    return {
      currentClientIp: cleanIp,
      currentGeo: {
        city: geo?.city || null,
        country: geo?.country || null,
        latitude: geo?.ll?.[0] ?? null,
        longitude: geo?.ll?.[1] ?? null,
      },
      isCurrentIpWhitelisted,
      items,
    };
  }

  async addIpWhitelist(
    dto: { ipAddress: string; description?: string },
    user: AuthenticatedUser,
  ) {
    const companyId = this.getEffectiveCompanyId(user);
    const userId = (user.id || user.sub)!;
    const enteredIp = dto.ipAddress.trim();
    const cleanIp = enteredIp === '*' ? enteredIp : normalizeIpAddress(enteredIp);

    if (!cleanIp) {
      throw new BadRequestException('Valid IP address is required');
    }

    return this.prisma.ipWhitelist.upsert({
      where: {
        companyId_ipAddress: {
          companyId,
          ipAddress: cleanIp,
        },
      },
      update: {
        description: dto.description || 'HR Whitelisted Office / Remote Hybrid IP',
        addedById: userId,
      },
      create: {
        companyId,
        ipAddress: cleanIp,
        description: dto.description || 'HR Whitelisted Office / Remote Hybrid IP',
        addedById: userId,
      },
    });
  }

  async removeIpWhitelist(id: string, user: AuthenticatedUser) {
    const companyId = this.getEffectiveCompanyId(user);
    const existing = await this.prisma.ipWhitelist.findFirst({
      where: { id, companyId },
    });
    if (!existing) throw new NotFoundException('Whitelisted IP entry not found');

    await this.prisma.ipWhitelist.delete({ where: { id } });
    return { message: 'IP removed from whitelist' };
  }
}
