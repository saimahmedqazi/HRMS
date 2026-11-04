import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DataScopeService } from '../../common/services/data-scope.service';
import { MailService } from '../../common/mail/mail.service';
import { AttendanceGateway } from './attendance.gateway';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import {
  UserRole,
  AttendanceStatus,
  RemoteWorkStatus,
  NotificationType,
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

  private getTodayDate(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  }

  async checkIn(dto: CheckInDto, ip: string, user: AuthenticatedUser) {
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

    const today = this.getTodayDate();

    // Check if attendance already recorded today
    const existing = await this.prisma.attendanceRecord.findUnique({
      where: {
        companyId_employeeId_date: {
          companyId,
          employeeId: employee.id,
          date: today,
        },
      },
    });

    if (existing && existing.checkInTime) {
      throw new ConflictException('You have already checked in for today');
    }

    const checkInTime = new Date();
    const cleanIp = (ip || '127.0.0.1').replace(/^::ffff:/, '');
    const geo = geoip.lookup(cleanIp);
    let status: AttendanceStatus = AttendanceStatus.PRESENT;

    // Check HR IP Whitelist for Office & Remote/Hybrid employees
    const whitelist =
      typeof (this.prisma as any).ipWhitelist?.findMany === 'function'
        ? await this.prisma.ipWhitelist.findMany({ where: { companyId } })
        : [];
    const isIpWhitelisted = (whitelist || []).some(
      (entry: any) => entry.ipAddress === cleanIp || entry.ipAddress === '*',
    );

    // Check for approved standing remote work permission covering today
    const permission = await this.prisma.remoteWorkPermission.findFirst({
      where: {
        companyId,
        employeeId: employee.id,
        status: RemoteWorkStatus.APPROVED,
        startDate: { lte: today },
        endDate: { gte: today },
      },
    });

    if (dto.isRemote) {
      if (isIpWhitelisted || permission) {
        status = AttendanceStatus.PRESENT_REMOTE;
      } else {
        // Unauthorized remote check-in -> route to HR Exceptions Queue
        status = AttendanceStatus.ABSENT_PENDING_REVIEW;
      }
    } else if (whitelist && whitelist.length > 0 && !isIpWhitelisted) {
      // Office IP restriction active: employee attempted onsite punch from non-whitelisted IP
      status = permission
        ? AttendanceStatus.PRESENT_REMOTE
        : AttendanceStatus.ABSENT_PENDING_REVIEW;
    }

    const resolvedLat =
      dto.latitude !== undefined ? dto.latitude : geo?.ll?.[0] ?? null;
    const resolvedLng =
      dto.longitude !== undefined ? dto.longitude : geo?.ll?.[1] ?? null;

    const locationString =
      resolvedLat !== null && resolvedLng !== null
        ? JSON.stringify({
            lat: resolvedLat,
            lng: resolvedLng,
            city: geo?.city || 'Local Network',
            country: geo?.country || 'PK',
            whitelisted: isIpWhitelisted,
          })
        : null;

    const record = await this.prisma.attendanceRecord.upsert({
      where: {
        companyId_employeeId_date: {
          companyId,
          employeeId: employee.id,
          date: today,
        },
      },
      update: {
        checkInTime,
        status,
        isRemote: dto.isRemote,
        checkInIp: cleanIp,
        checkInLocation: locationString,
        notes: dto.notes,
        markedBySystem: false,
      },
      create: {
        companyId,
        employeeId: employee.id,
        date: today,
        checkInTime,
        status,
        isRemote: dto.isRemote,
        checkInIp: cleanIp,
        checkInLocation: locationString,
        notes: dto.notes,
        markedBySystem: false,
      },
    });

    // If routed to HR Exceptions Queue, broadcast alert
    if (status === AttendanceStatus.ABSENT_PENDING_REVIEW) {
      const payload = {
        attendanceId: record.id,
        employeeId: employee.id,
        employeeName: `${employee.firstName} ${employee.lastName}`,
        date: today.toISOString(),
        checkInTime: checkInTime.toISOString(),
        ipAddress: ip,
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

    const today = this.getTodayDate();

    const record = await this.prisma.attendanceRecord.findUnique({
      where: {
        companyId_employeeId_date: {
          companyId,
          employeeId: employee.id,
          date: today,
        },
      },
    });

    if (!record || !record.checkInTime) {
      throw new BadRequestException('You have not checked in today');
    }
    if (record.checkOutTime) {
      throw new BadRequestException('You have already checked out today');
    }

    const checkOutTime = new Date();
    const totalMinutes = Math.round(
      (checkOutTime.getTime() - record.checkInTime.getTime()) / 60000,
    );

    // Look up assigned shift duration (standard 8h = 480m)
    const empShift = await this.prisma.employeeShift.findFirst({
      where: { employeeId: employee.id },
      include: { shift: true },
    });
    const standardWorkMinutes = 480; // Default 8 hours
    const overtimeMinutes = Math.max(0, totalMinutes - standardWorkMinutes);

    return this.prisma.attendanceRecord.update({
      where: { id: record.id },
      data: {
        checkOutTime,
        workMinutes: totalMinutes,
        overtimeMinutes,
        notes: dto.notes ? `${record.notes || ''} | Checkout: ${dto.notes}`.trim() : record.notes,
      },
    });
  }

  async getTodayStatus(user: AuthenticatedUser) {
    const companyId = this.getEffectiveCompanyId(user);
    const userId = (user.id || user.sub)!;

    const employee = await this.prisma.employee.findFirst({
      where: { userId, companyId, deletedAt: null },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    const today = this.getTodayDate();

    const record = await this.prisma.attendanceRecord.findUnique({
      where: {
        companyId_employeeId_date: {
          companyId,
          employeeId: employee.id,
          date: today,
        },
      },
    });

    return record || { status: null, checkedIn: false, date: today };
  }

  async listAttendanceRecords(user: AuthenticatedUser, filter: AttendanceFilter = {}) {
    const companyId = this.getEffectiveCompanyId(user);
    const userId = (user.id || user.sub)!;

    const callerEmployee = await this.prisma.employee.findFirst({
      where: { userId },
      select: { id: true, departmentId: true, teamId: true },
    });

    const scopeFilter = this.dataScopeService.applyScope(user, {
      departmentId: callerEmployee?.departmentId || undefined,
      teamId: callerEmployee?.teamId || undefined,
      employeeId: callerEmployee?.id || undefined,
    });

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
      include: { employee: { include: { user: true } } },
    });
    if (!record) throw new NotFoundException('Attendance record not found');

    const newStatus =
      dto.action === 'APPROVE'
        ? AttendanceStatus.PRESENT_REMOTE
        : AttendanceStatus.ABSENT;

    const updated = await this.prisma.attendanceRecord.update({
      where: { id },
      data: {
        status: newStatus,
        notes: dto.notes
          ? `${record.notes || ''} | HR Resolution: ${dto.action} (${dto.notes})`.trim()
          : record.notes,
      },
    });

    // Notify employee of resolution
    await this.prisma.notification.create({
      data: {
        companyId,
        userId: record.employee.userId,
        type: NotificationType.ATTENDANCE_EXCEPTION,
        title: `Remote Check-in Exception ${dto.action === 'APPROVE' ? 'Approved' : 'Rejected'}`,
        body: `Your remote check-in for ${record.date.toDateString()} was ${dto.action.toLowerCase()}d by HR.`,
        data: { attendanceId: id, status: newStatus },
      },
    });

    return updated;
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
    const userId = (user.id || user.sub)!;

    const employee = await this.prisma.employee.findFirst({
      where: { userId },
    });

    return this.prisma.remoteWorkPermission.findMany({
      where: {
        companyId,
        ...(user.role === UserRole.EMPLOYEE ? { employeeId: employee?.id } : {}),
      },
      include: {
        employee: {
          select: {
            id: true,
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
      where: { id, companyId },
    });
    if (!permission) throw new NotFoundException('Permission request not found');
    if (permission.status && permission.status !== RemoteWorkStatus.PENDING) {
      throw new BadRequestException('Permission request is no longer pending');
    }

    return this.prisma.remoteWorkPermission.update({
      where: { id },
      data: {
        step1ApproverId: userId,
        step1ApprovedAt: new Date(),
      },
    });
  }

  async approvePermissionStep2(id: string, user: AuthenticatedUser) {
    const companyId = this.getEffectiveCompanyId(user);
    const userId = (user.id || user.sub)!;

    const permission = await this.prisma.remoteWorkPermission.findFirst({
      where: { id, companyId },
    });
    if (!permission) throw new NotFoundException('Permission request not found');
    if (permission.status && permission.status !== RemoteWorkStatus.PENDING) {
      throw new BadRequestException('Permission request is no longer pending');
    }

    return this.prisma.remoteWorkPermission.update({
      where: { id },
      data: {
        step2ApproverId: userId,
        step2ApprovedAt: new Date(),
        status: RemoteWorkStatus.APPROVED,
      },
    });
  }

  // HR IP Whitelist Management (Office & Remote/Hybrid WFH IPs)
  async listIpWhitelist(user: AuthenticatedUser, currentIp: string) {
    const companyId = this.getEffectiveCompanyId(user);
    const cleanIp = (currentIp || '127.0.0.1').replace(/^::ffff:/, '');
    const geo = geoip.lookup(cleanIp);

    const items = await this.prisma.ipWhitelist.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });

    const isCurrentIpWhitelisted = items.some(
      (item) => item.ipAddress === cleanIp || item.ipAddress === '*',
    );

    return {
      currentClientIp: cleanIp,
      currentGeo: {
        city: geo?.city || (cleanIp === '127.0.0.1' || cleanIp === '::1' ? 'Local Office Network' : 'Verified Network'),
        country: geo?.country || 'PK',
        latitude: geo?.ll?.[0] ?? 24.8607,
        longitude: geo?.ll?.[1] ?? 67.0011,
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
    const cleanIp = dto.ipAddress.trim().replace(/^::ffff:/, '');

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
