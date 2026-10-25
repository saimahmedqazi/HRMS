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
    let status: AttendanceStatus = AttendanceStatus.PRESENT;

    if (dto.isRemote) {
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

      if (permission) {
        status = AttendanceStatus.PRESENT_REMOTE;
      } else {
        // Unauthorized remote check-in -> route to HR Exceptions Queue
        status = AttendanceStatus.ABSENT_PENDING_REVIEW;
      }
    }

    const locationString =
      dto.latitude && dto.longitude
        ? JSON.stringify({ lat: dto.latitude, lng: dto.longitude })
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
        checkInIp: ip,
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
        checkInIp: ip,
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
      ...(scopeFilter.id ? { employeeId: scopeFilter.id } : {}),
      ...(filter.employeeId ? { employeeId: filter.employeeId } : {}),
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

    return this.prisma.remoteWorkPermission.update({
      where: { id },
      data: {
        step2ApproverId: userId,
        step2ApprovedAt: new Date(),
        status: RemoteWorkStatus.APPROVED,
      },
    });
  }
}
