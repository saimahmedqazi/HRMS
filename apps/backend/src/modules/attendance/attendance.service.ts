import { lockEmployeeShift } from '@common/utils/attendance-locks';
import { lockEmployeeLeave } from '@common/utils/leave-locks';
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { attendanceDayStart, getCompanyAttendanceTime, previousAttendanceDate } from '../../common/utils/attendance-date';
import { parseEmployeeDate } from '../../common/utils/employee-dates';
import { classifyWork, netWorkMinutes, punchPolicy, savedPunchPolicy, validPolicyDurations } from '../../common/utils/attendance-policy';
import { ShiftPolicyDto } from './dto/shift-policy.dto';
import { AssignShiftDto } from './dto/assign-shift.dto';
import { findCurrentPunch, resolveEmployeeAttendanceDay, scheduleOn } from '../../common/utils/attendance-shift';
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

  async listShifts(user: AuthenticatedUser) {
    const companyId = this.getEffectiveCompanyId(user);
    return this.prisma.shift.findMany({
      where: { companyId },
      include: { revisions: { orderBy: { effectiveDate: 'desc' } } },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  async scheduleShiftPolicy(dto: ShiftPolicyDto, user: AuthenticatedUser, shiftId?: string) {
    if (user.role !== UserRole.COMPANY_ADMIN || !user.companyId || user.supportModeCompanyId) {
      throw new ForbiddenException('Only the company CEO may change shift policies');
    }
    const companyId = user.companyId;
    const { effectiveDate: value, name, ...rules } = dto;
    const effectiveDate = parseEmployeeDate(value);
    if (!effectiveDate || !validPolicyDurations({ ...rules, overtimeCapMinutes: rules.overtimeCapMinutes ?? null })) {
      throw new BadRequestException('Use a valid date and shift span. Half-day minutes must be below full-day minutes, and full-day minutes cannot exceed the required net minutes.');
    }
    const local = await getCompanyAttendanceTime(this.prisma, companyId, new Date());
    if (effectiveDate <= local.date) throw new BadRequestException('Choose an effective date after today in the company timezone.');
    const normalizedName = name?.trim() ?? '';
    if (!shiftId && !normalizedName) throw new BadRequestException('Enter a shift name.');
    return this.prisma.$transaction(async (tx) => {
      let shift;
      if (shiftId) {
        shift = await tx.shift.findFirst({ where: { id: shiftId, companyId } });
      } else {
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${'shift-name:' + companyId + ':' + normalizedName.toLowerCase()}, 0))`;
        const existingShifts = await tx.shift.findMany({
          where: { companyId },
          select: { id: true, name: true },
        });
        const duplicate = existingShifts.find(
          (s) => s.name.trim().toLowerCase() === normalizedName.toLowerCase(),
        );
        if (duplicate) {
          throw new ConflictException(`A shift named "${normalizedName}" already exists in your company.`);
        }
        shift = await tx.shift.create({
          data: {
            companyId,
            name: normalizedName,
            startTime: rules.startTime,
            endTime: rules.endTime,
            workDays: rules.workDays,
            breakDuration: rules.breakDuration,
          },
        });
      }
      if (!shift) throw new NotFoundException('Shift not found');
      const inserted = await tx.shiftRevision.createMany({
        data: { ...rules, companyId, shiftId: shift.id, effectiveDate },
        skipDuplicates: true,
      });
      if (!inserted.count) throw new ConflictException('This shift already has a policy effective on that date.');
      return { shiftId: shift.id, effectiveDate };
    });
  }

  async assignShift(
    shiftId: string,
    employeeId: string,
    user: AuthenticatedUser,
    dto: AssignShiftDto = {},
  ) {
    if (user.role !== UserRole.COMPANY_ADMIN && user.role !== UserRole.HR_MANAGER) {
      throw new ForbiddenException('Only authorized CEO or HR managers may assign employee shifts.');
    }
    const companyId = this.getEffectiveCompanyId(user);
    const callerUserId = user.id || user.sub;
    const local = await getCompanyAttendanceTime(this.prisma, companyId, new Date());
    const today = local.date;
    const tomorrow = new Date(today.getTime() + 86_400_000);

    let requestedDate = tomorrow;
    if (dto.effectiveDate) {
      const parsed = parseEmployeeDate(dto.effectiveDate);
      if (!parsed) {
        throw new BadRequestException('Effective date must be a valid calendar date (YYYY-MM-DD).');
      }
      requestedDate = new Date(
        Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()),
      );
      if (requestedDate.getTime() < today.getTime()) {
        throw new BadRequestException('Cannot assign a shift retroactively to a past date.');
      }
    }

    const requestedDateStr = requestedDate.toISOString().slice(0, 10);
    const effectiveFrom = attendanceDayStart(requestedDate, local.timezone);

    return this.prisma.$transaction(async (tx) => {
      await lockEmployeeShift(tx, companyId, employeeId);

      const employee = await tx.employee.findFirst({
        where: { id: employeeId, companyId, deletedAt: null },
        select: { id: true, userId: true, firstName: true, lastName: true },
      });
      const shift = await tx.shift.findFirst({
        where: { id: shiftId, companyId },
        include: { revisions: { orderBy: { effectiveDate: 'asc' }, take: 1 } },
      });
      if (!employee || !shift) throw new NotFoundException('Employee or shift not found');

      if (!shift.isDefault && shift.revisions[0] && shift.revisions[0].effectiveDate > requestedDate) {
        throw new BadRequestException('This shift does not have an active policy revision on the selected effective date.');
      }

      if (requestedDate.getTime() === today.getTime()) {
        const previousDate = previousAttendanceDate(today);
        const [todayAttendance, activeOvernight, activeTimer] = await Promise.all([
          tx.attendanceRecord.findFirst({
            where: { companyId, employeeId, date: today },
            select: { id: true },
          }),
          tx.attendanceRecord.findFirst({
            where: {
              companyId,
              employeeId,
              date: previousDate,
              checkInTime: { not: null },
              checkOutTime: null,
              finalizedAt: null,
              status: { not: AttendanceStatus.MISSING_CHECKOUT },
            },
            select: { id: true },
          }),
          tx.workTimerEntry.findFirst({
            where: {
              companyId,
              employeeId,
              date: { in: [today, previousDate] },
              status: { in: [TimerStatus.RUNNING, TimerStatus.PAUSED] },
            },
            select: { id: true },
          }),
        ]);
        if (todayAttendance || activeOvernight || activeTimer) {
          throw new BadRequestException(
            'Cannot assign a shift effective today because the employee already has attendance activity or an active punch for the current working day. Choose tomorrow or a later date.',
          );
        }
      }

      const existingAssignments = await tx.employeeShift.findMany({
        where: { companyId, employeeId },
        orderBy: [{ effectiveFrom: 'asc' }, { id: 'asc' }],
      });

      const sameDateAssignment = existingAssignments.find(
        (item) => item.effectiveFrom.getTime() === effectiveFrom.getTime(),
      );

      let savedAssignment;
      let shouldNotify = true;

      if (sameDateAssignment) {
        if (sameDateAssignment.shiftId === shiftId) {
          return { ...sameDateAssignment, idempotent: true };
        }
        if (!dto.replaceExisting) {
          throw new ConflictException(
            `A shift assignment already exists for ${requestedDateStr}. Confirm replacement to update it.`,
          );
        }
        savedAssignment = await tx.employeeShift.update({
          where: { id: sameDateAssignment.id },
          data: { shiftId },
        });
      } else {
        const prev = existingAssignments.filter((item) => item.effectiveFrom < effectiveFrom).at(-1);
        const next = existingAssignments.find((item) => item.effectiveFrom > effectiveFrom);

        if (prev && (prev.effectiveTo === null || prev.effectiveTo >= effectiveFrom)) {
          await tx.employeeShift.update({
            where: { id: prev.id },
            data: { effectiveTo: new Date(effectiveFrom.getTime() - 1) },
          });
        }

        savedAssignment = await tx.employeeShift.create({
          data: {
            companyId,
            employeeId,
            shiftId,
            effectiveFrom,
            effectiveTo: next ? new Date(next.effectiveFrom.getTime() - 1) : null,
          },
        });
      }

      if (shouldNotify && employee.userId && employee.userId !== callerUserId) {
        const isImmediate = requestedDate.getTime() === today.getTime();
        await tx.notification.create({
          data: {
            companyId,
            userId: employee.userId,
            type: NotificationType.GENERAL,
            title: isImmediate ? 'Shift Updated (Effective Today)' : 'Upcoming Shift Scheduled',
            body: isImmediate
              ? `Your shift has been updated to ${shift.name} effective today (${requestedDateStr}).`
              : `Your shift has been scheduled to ${shift.name} effective ${requestedDateStr}.`,
            data: {
              kind: 'SHIFT_ASSIGNMENT',
              shiftId: shift.id,
              employeeId,
              effectiveDate: requestedDateStr,
              isImmediate,
            },
          },
        });
      }

      return savedAssignment;
    });
  }

  async getEmployeeShifts(employeeId: string, user: AuthenticatedUser) {
    const companyId = this.getEffectiveCompanyId(user);
    const scope = await this.dataScopeService.resolveEmployeeScope(this.prisma, companyId, user);
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, ...scope },
      select: { id: true, userId: true },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    const now = new Date();
    const local = await getCompanyAttendanceTime(this.prisma, companyId, now);
    const today = local.date;
    const tomorrow = new Date(today.getTime() + 86_400_000);
    const todayEnd = new Date(attendanceDayStart(tomorrow, local.timezone).getTime() - 1);

    const [assignments, defaultShift] = await Promise.all([
      this.prisma.employeeShift.findMany({
        where: { companyId, employeeId },
        include: {
          shift: {
            include: {
              revisions: { orderBy: { effectiveDate: 'asc' } },
            },
          },
        },
        orderBy: [{ effectiveFrom: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.shift.findFirst({
        where: { companyId, isDefault: true },
        include: { revisions: { orderBy: { effectiveDate: 'asc' } } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    ]);

    const activeAssignment =
      assignments
        .filter((a) => a.effectiveFrom <= todayEnd && (a.effectiveTo === null || a.effectiveTo >= now))
        .at(-1) ?? null;

    const currentShiftBase = activeAssignment?.shift ?? defaultShift;
    const currentResolved = currentShiftBase
      ? scheduleOn(
          {
            ...currentShiftBase,
            revisions: currentShiftBase.revisions.filter((r) => r.effectiveDate <= today).reverse(),
          },
          today,
        )
      : null;

    const upcomingAssignments = assignments
      .filter((a) => a.effectiveFrom > todayEnd)
      .map((a) => {
        const effDate = new Date(
          Date.UTC(
            a.effectiveFrom.getUTCFullYear(),
            a.effectiveFrom.getUTCMonth(),
            a.effectiveFrom.getUTCDate(),
          ),
        );
        const effDateStr = effDate.toISOString().slice(0, 10);
        const resolved = scheduleOn(
          {
            ...a.shift,
            revisions: a.shift.revisions.filter((r) => r.effectiveDate <= effDate).reverse(),
          },
          effDate,
        );
        return {
          id: a.id,
          shiftId: a.shiftId,
          shiftName: a.shift.name,
          effectiveDate: effDateStr,
          effectiveFrom: a.effectiveFrom,
          effectiveTo: a.effectiveTo,
          startTime: resolved?.startTime ?? a.shift.startTime,
          endTime: resolved?.endTime ?? a.shift.endTime,
          workDays: resolved?.workDays ?? a.shift.workDays,
          breakDuration: resolved?.breakDuration ?? a.shift.breakDuration,
          status: 'SCHEDULED' as const,
        };
      });

    const relevantShiftIds = new Set<string>();
    if (currentShiftBase) relevantShiftIds.add(currentShiftBase.id);
    for (const a of upcomingAssignments) relevantShiftIds.add(a.shiftId);

    const upcomingCompanyRevisions = [
      ...(currentShiftBase ? [currentShiftBase] : []),
      ...assignments.map((a) => a.shift),
    ]
      .filter((s, idx, arr) => relevantShiftIds.has(s.id) && arr.findIndex((x) => x.id === s.id) === idx)
      .flatMap((s) =>
        s.revisions
          .filter((r) => r.effectiveDate > today)
          .map((r) => ({
            id: `${s.id}:${r.effectiveDate.toISOString().slice(0, 10)}`,
            shiftId: s.id,
            shiftName: s.name,
            effectiveDate: r.effectiveDate.toISOString().slice(0, 10),
            startTime: r.startTime,
            endTime: r.endTime,
            workDays: r.workDays,
            breakDuration: r.breakDuration,
          })),
      )
      .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));

    return {
      timezone: local.timezone ?? 'UTC',
      today: today.toISOString().slice(0, 10),
      tomorrow: tomorrow.toISOString().slice(0, 10),
      currentShift: currentShiftBase && currentResolved
        ? {
            shiftId: currentShiftBase.id,
            shiftName: currentShiftBase.name,
            isDefaultFallback: !activeAssignment,
            effectiveFrom: activeAssignment?.effectiveFrom ?? null,
            startTime: currentResolved.startTime,
            endTime: currentResolved.endTime,
            workDays: currentResolved.workDays,
            breakDuration: currentResolved.breakDuration,
            requiredMinutes: currentResolved.revision?.requiredMinutes ?? null,
            halfDayMinutes: currentResolved.revision?.halfDayMinutes ?? null,
            fullDayMinutes: currentResolved.revision?.fullDayMinutes ?? null,
            overtimeEnabled: currentResolved.revision?.overtimeEnabled ?? true,
            overtimeCapMinutes: currentResolved.revision?.overtimeCapMinutes ?? null,
          }
        : null,
      upcomingAssignments,
      upcomingCompanyRevisions,
    };
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
    const cleanIp = normalizeIpAddress(ip ?? undefined);
    // Check HR IP Whitelist for Office & Remote/Hybrid employees
    const whitelist = await this.prisma.ipWhitelist.findMany({ where: { companyId } });
    const isIpWhitelisted = cleanIp !== null && whitelist.some(
      (entry) => entry.ipAddress === cleanIp || entry.ipAddress === '*',
    );

    const { record, hrUsers, status, shiftDate } = await this.prisma.$transaction(async (tx) => {
      await lockEmployeeLeave(tx, companyId, employee.id);
      await lockEmployeeShift(tx, companyId, employee.id);
      const lockedDates = await resolveEmployeeAttendanceDay(tx, scope, checkInTime, local);
      const lockedShiftDate = lockedDates.date;
      let status: AttendanceStatus = AttendanceStatus.IN_PROGRESS;
      let isRemote = dto.isRemote;

      // Check for approved standing remote work permission covering the shift.
      const permission = await tx.remoteWorkPermission.findFirst({
        where: {
          companyId,
          employeeId: employee.id,
          status: RemoteWorkStatus.APPROVED,
          startDate: { lte: lockedShiftDate },
          endDate: { gte: lockedShiftDate },
        },
      });

      if (dto.isRemote) {
        if (isIpWhitelisted || permission) {
          status = AttendanceStatus.IN_PROGRESS;
        } else {
          // Unauthorized remote check-in -> route to HR Exceptions Queue
          status = AttendanceStatus.ABSENT_PENDING_REVIEW;
        }
      } else if (whitelist.length > 0 && !isIpWhitelisted) {
        // Office IP restriction active: employee attempted onsite punch from non-whitelisted IP
        isRemote = true;
        status = permission
          ? AttendanceStatus.IN_PROGRESS
          : AttendanceStatus.ABSENT_PENDING_REVIEW;
      }

      const lockedKey = { ...scope, date: lockedShiftDate };
      const existing = await findCurrentPunch(tx, scope, lockedDates);
      if (existing?.checkInTime) {
        throw new ConflictException(
          existing.date.getTime() === lockedShiftDate.getTime()
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
      if (existing && ([AttendanceStatus.ON_LEAVE, AttendanceStatus.HOLIDAY, AttendanceStatus.WEEKEND] as AttendanceStatus[]).includes(existing.status)) {
        throw new ConflictException('This date is recorded as leave, holiday or a non-working day.');
      }
      await tx.attendanceRecord.createMany({ data: lockedKey, skipDuplicates: true });
      const record = await tx.attendanceRecord.update({
        where: {
          companyId_employeeId_date: lockedKey,
          checkInTime: null,
          status: { notIn: [AttendanceStatus.ON_LEAVE, AttendanceStatus.HOLIDAY, AttendanceStatus.WEEKEND] },
        },
        data: {
          checkInTime,
          status,
          isRemote,
          punchPolicy: punchPolicy(lockedDates.shift, lockedShiftDate, local.timezone),
          remoteReviewPending: status === AttendanceStatus.ABSENT_PENDING_REVIEW,
          checkInIp: cleanIp,
          checkInLocation,
          notes: dto.notes,
          markedBySystem: false,
        },
      });
      if (status !== AttendanceStatus.ABSENT_PENDING_REVIEW) return { record, hrUsers: [], status, shiftDate: lockedShiftDate };

      const hrUsers = await tx.user.findMany({
        where: { companyId, role: UserRole.HR_MANAGER, deletedAt: null },
        select: { id: true, email: true },
      });
      if (hrUsers.length) {
        await tx.notification.createMany({ data: hrUsers.map(({ id }) => ({
          companyId,
          userId: id,
          type: NotificationType.ATTENDANCE_EXCEPTION,
          title: 'Unauthorized Remote Check-in Exception',
          body: `${employee.firstName} ${employee.lastName} performed an unauthorized remote check-in. Review required.`,
          data: { attendanceId: record.id, employeeId: employee.id },
        })) });
      }
      return { record, hrUsers, status, shiftDate: lockedShiftDate };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }).catch((error: unknown) => {
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

      await this.gateway.broadcastAttendanceException(companyId, payload);

      const deliveries = await Promise.allSettled(hrUsers.map((hr) =>
        this.mailService.sendMail({
          to: hr.email,
          subject: 'Attendance Exception: Unauthorized Remote Check-in',
          html: `
            <p><strong>Employee:</strong> ${employee.firstName} ${employee.lastName} (${employee.employeeCode})</p>
            <p><strong>Check-in Time:</strong> ${checkInTime.toLocaleTimeString()}</p>
            <p><strong>Status:</strong> Routed to HR Exceptions Queue pending review.</p>
          `,
        }),
      ));
      if (deliveries.some((result) => result.status === 'rejected' || !result.value)) {
        this.logger.warn('An attendance exception email could not be sent. The in-app alert was recorded.');
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
    if (record.checkOutTime || record.finalizedAt || record.status === AttendanceStatus.MISSING_CHECKOUT) {
      throw new BadRequestException('You have already checked out for this shift');
    }

    const completedTimer = await this.prisma.workTimerEntry.findFirst({
      where: { ...scope, date: record.date, status: TimerStatus.STOPPED,
        startedAt: { gte: record.checkInTime }, stoppedAt: { lte: checkOutTime },
        company: { subscriptionTier: 'PREMIUM' } },
      select: { totalMinutes: true },
    });
    const policy = savedPunchPolicy(record.punchPolicy) ?? punchPolicy(dates.shift, record.date, local.timezone);
    const totalMinutes = netWorkMinutes(checkOutTime.getTime() - record.checkInTime.getTime(), policy, completedTimer?.totalMinutes);
    const result = classifyWork(totalMinutes, policy, record.isRemote);
    const status = record.remoteRejected ? AttendanceStatus.ABSENT
      : record.remoteReviewPending || record.status === AttendanceStatus.ABSENT_PENDING_REVIEW
        ? AttendanceStatus.ABSENT_PENDING_REVIEW : result.status;

    return this.prisma.attendanceRecord.update({
      where: { id: record.id, companyId, checkOutTime: null, status: record.status, remoteRejected: record.remoteRejected, remoteReviewPending: record.remoteReviewPending },
      data: {
        checkOutTime,
        finalizedAt: checkOutTime,
        workMinutes: totalMinutes,
        status,
        overtimeMinutes: status === result.status && !record.remoteRejected ? result.overtimeMinutes : 0,
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
    return {
      ...(record ?? { status: null, checkedIn: false, date: dates.date }),
      shift: dates.shift ?? null,
      timezone: local.timezone,
    };
  }

  async listAttendanceRecords(user: AuthenticatedUser, filter: AttendanceFilter = {}) {
    const companyId = this.getEffectiveCompanyId(user);
    const startDate = filter.startDate ? parseEmployeeDate(filter.startDate) : undefined;
    const endDate = filter.endDate ? parseEmployeeDate(filter.endDate) : undefined;
    if ((filter.startDate && (!startDate || filter.startDate.length !== 10)) ||
        (filter.endDate && (!endDate || filter.endDate.length !== 10))) {
      throw new BadRequestException('Attendance filters require valid dates in YYYY-MM-DD format.');
    }
    if (startDate && endDate && endDate < startDate) {
      throw new BadRequestException('End date cannot be earlier than start date.');
    }
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
      ...(startDate || endDate
        ? {
            date: {
              gte: startDate,
              lte: endDate,
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
        status: { in: [AttendanceStatus.ABSENT_PENDING_REVIEW, AttendanceStatus.MISSING_CHECKOUT] },
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
      select: { date: true, status: true, notes: true, checkOutTime: true, finalizedAt: true, punchPolicy: true, workMinutes: true, isRemote: true, employee: { select: { userId: true } } },
    });
    if (!record) throw new NotFoundException('Attendance record not found');
    const conflictMessage = 'This attendance exception is no longer pending review.';
    if (record.status !== AttendanceStatus.ABSENT_PENDING_REVIEW && record.status !== AttendanceStatus.MISSING_CHECKOUT) {
      throw new ConflictException(conflictMessage);
    }

    const approved = dto.action === 'APPROVE';
    const policy = savedPunchPolicy(record.punchPolicy);
    const missing = record.status === AttendanceStatus.MISSING_CHECKOUT;
    if (missing && approved && dto.workMinutes == null) throw new BadRequestException('Enter verified net minutes for a missing checkout.');
    const minutes = missing ? dto.workMinutes ?? 0 : record.workMinutes;
    const result = policy && classifyWork(minutes, policy, record.isRemote);
    const status = approved
      ? policy && !missing && !record.checkOutTime ? AttendanceStatus.IN_PROGRESS : result?.status ?? AttendanceStatus.PRESENT_REMOTE
      : policy && !policy.scheduled ? AttendanceStatus.WEEKEND : AttendanceStatus.ABSENT;
    const decision = approved ? 'approved' : 'rejected';

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.attendanceRecord.update({
        where: { id, companyId, status: record.status, checkOutTime: record.checkOutTime, finalizedAt: record.finalizedAt },
        data: {
          status,
          ...(policy ? {
            workMinutes: minutes,
            overtimeMinutes: approved && status !== AttendanceStatus.IN_PROGRESS ? result?.overtimeMinutes ?? 0 : 0,
            remoteReviewPending: false,
            remoteRejected: !approved,
            ...((missing || !approved) ? { finalizedAt: new Date() } : {}),
          } : {}),
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
          title: `Attendance Exception ${approved ? 'Approved' : 'Rejected'}`,
          body: `Your attendance for ${record.date.toDateString()} was ${decision} by HR.`,
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

    const startDate = parseEmployeeDate(dto.startDate);
    const endDate = parseEmployeeDate(dto.endDate);
    if (!startDate || !endDate || dto.startDate.length !== 10 || dto.endDate.length !== 10) {
      throw new BadRequestException('Enter valid start and end dates in YYYY-MM-DD format.');
    }
    if (endDate < startDate) {
      throw new BadRequestException('End date cannot be earlier than start date');
    }
    const reason = dto.reason.trim();
    if (!reason) throw new BadRequestException('Enter a reason for the remote work request.');

    const employee = await this.prisma.employee.findFirst({
      where: { userId, companyId, deletedAt: null },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    return this.prisma.remoteWorkPermission.create({
      data: {
        companyId,
        employeeId: employee.id,
        startDate,
        endDate,
        reason,
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
