import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { getAttendanceDay, getCompanyAttendanceTime, previousAttendanceDate } from '../../common/utils/attendance-date';
import { findCurrentPunch, findCurrentTimer, resolveEmployeeAttendanceDay, shiftStandardMinutes } from '../../common/utils/attendance-shift';
import { MailService } from '../../common/mail/mail.service';
import { AttendanceGateway } from '../attendance/attendance.gateway';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import {
  SubscriptionTier,
  TimerStatus,
  NotificationType,
  EmployeeStatus,
  CompanyStatus,
  Prisma,
  UserRole,
} from '@prisma/client';

const alertRelations = {
  department: { select: { companyId: true, name: true, managerId: true, deletedAt: true } },
  team: { select: { companyId: true, leadId: true, deletedAt: true } },
} as const;

type AlertEmployee = Prisma.EmployeeGetPayload<{ include: typeof alertRelations }>;

@Injectable()
export class WorkTimerService {
  private readonly logger = new Logger(WorkTimerService.name);
  private checkingPausedTimers = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly gateway: AttendanceGateway,
  ) {}

  private getEffectiveCompanyId(user: AuthenticatedUser): string {
    const companyId = user.supportModeCompanyId || user.companyId;
    if (!companyId) throw new ForbiddenException('Company context required');
    return companyId;
  }

  private async getPremiumTimerTime(companyId: string, now: Date) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { subscriptionTier: true, timezone: true },
    });

    if (!company || company.subscriptionTier !== SubscriptionTier.PREMIUM) {
      throw new ForbiddenException(
        'The Work Timer is a ZenHR Premium tier feature. Please upgrade your company subscription to enable real-time timer tracking.',
      );
    }
    return getAttendanceDay(now, company.timezone);
  }

  private async recordBreakAlert(
    tx: Prisma.TransactionClient,
    employee: AlertEmployee,
    breaks: { endedAt: Date | null; durationMin: number | null }[],
    closedBreakMinutes: number,
    allowedBreak: number,
    revision: { id: string; status: TimerStatus; updatedAt: Date },
    openBreakId?: string,
  ) {
    const previous = breaks.reduce((sum, entry) => sum + (entry.endedAt ? entry.durationMin ?? 0 : 0), 0);
    const total = previous + closedBreakMinutes;
    if (previous > allowedBreak || total <= allowedBreak) return null;

    const { companyId, team, department } = employee;
    const leadId = team?.companyId === companyId && !team.deletedAt ? team.leadId : null;
    const managerId = department?.companyId === companyId && !department.deletedAt ? department.managerId : null;
    const recipients = await tx.user.findMany({
      where: {
        companyId,
        deletedAt: null,
        NOT: { employee: { OR: [
          { deletedAt: { not: null } },
          { status: { in: [EmployeeStatus.SUSPENDED, EmployeeStatus.TERMINATED, EmployeeStatus.RESIGNED] } },
        ] } },
        OR: [
          { role: { in: [UserRole.COMPANY_ADMIN, UserRole.HR_MANAGER] } },
          ...(leadId ? [{ role: UserRole.TEAM_LEAD, employee: { id: leadId, companyId } }] : []),
          ...(managerId ? [{ role: UserRole.DEPARTMENT_MANAGER, employee: { id: managerId, companyId } }] : []),
        ],
      },
      select: { id: true, email: true },
    });
    if (!recipients.length) return null;

    const claimed = await tx.workTimerEntry.updateMany({
      where: {
        id: revision.id, companyId, status: revision.status, updatedAt: revision.updatedAt,
        breakAlertedAt: null,
        ...(openBreakId ? { breaks: { some: { id: openBreakId, endedAt: null } } } : {}),
      },
      // Keep the timer revision stable so an alert does not interfere with Resume or Stop.
      data: { breakAlertedAt: new Date(), updatedAt: revision.updatedAt },
    });
    if (!claimed.count) return null;

    const name = `${employee.firstName} ${employee.lastName}`;
    const title = `Excessive Break Alert: ${name}`;
    const body = `${name} took ${total} minutes of break (allowed: ${allowedBreak}m).`;
    await tx.notification.createMany({ data: recipients.map(({ id }) => ({
      companyId, userId: id, type: NotificationType.BREAK_ALERT, title, body,
      data: { employeeId: employee.id, totalBreakMinutes: total, allowedBreak },
    })) });
    return { recipients, title, body };
  }

  private async deliverBreakAlert(companyId: string, alert: Awaited<ReturnType<WorkTimerService['recordBreakAlert']>>) {
    if (!alert) return;
    this.gateway.broadcastBreakAlert(companyId, alert.recipients.map(({ id }) => id));
    const deliveries = await Promise.allSettled(alert.recipients.map(({ email }) =>
      this.mailService.sendMail({ to: email, subject: alert.title, text: alert.body }),
    ));
    if (deliveries.some((result) => result.status === 'rejected' || !result.value)) {
      this.logger.warn('A break alert email could not be sent. The in-app alert was recorded.');
    }
  }

  @Cron('*/15 * * * * *')
  async checkPausedBreaks() {
    if (this.checkingPausedTimers) return;
    this.checkingPausedTimers = true;
    const now = new Date();
    const earliestDate = previousAttendanceDate(previousAttendanceDate(getAttendanceDay(now).date));
    let afterId: string | undefined;

    try {
      for (;;) {
        const timers = await this.prisma.workTimerEntry.findMany({
          where: {
            id: afterId ? { gt: afterId } : undefined,
            status: TimerStatus.PAUSED,
            date: { gte: earliestDate },
            breakAlertedAt: null,
            company: { status: CompanyStatus.ACTIVE, subscriptionTier: SubscriptionTier.PREMIUM },
            employee: { deletedAt: null, status: { notIn: [EmployeeStatus.SUSPENDED, EmployeeStatus.TERMINATED, EmployeeStatus.RESIGNED] } },
            breaks: { some: { endedAt: null, startedAt: { lte: now } } },
          },
          orderBy: { id: 'asc' },
          take: 25,
          include: { employee: { include: alertRelations }, company: { select: { timezone: true } }, breaks: true },
        });
        if (!timers.length) break;

        for (const timer of timers) {
          try {
            if (timer.employee.companyId !== timer.companyId) continue;
            const openBreak = timer.breaks.find((entry) => !entry.endedAt);
            if (!openBreak) continue;
            const local = getAttendanceDay(now, timer.company.timezone);
            if (timer.date < previousAttendanceDate(local.date)) continue;
            const dates = await resolveEmployeeAttendanceDay(this.prisma, timer, now, local);
            const minutes = Math.round((now.getTime() - openBreak.startedAt.getTime()) / 60_000);
            const alert = await this.prisma.$transaction((tx) =>
              this.recordBreakAlert(tx, timer.employee, timer.breaks, minutes, dates.shift?.breakDuration ?? 60, timer, openBreak.id),
            );
            void this.deliverBreakAlert(timer.companyId, alert).catch((error: unknown) => {
              this.logger.error('Could not deliver a recorded break alert.', error);
            });
          } catch (error) {
            this.logger.error(`Could not check break overstay for timer ${timer.id}.`, error);
          }
        }
        afterId = timers[timers.length - 1].id;
      }
    } finally {
      this.checkingPausedTimers = false;
    }
  }

  async startTimer(user: AuthenticatedUser) {
    const companyId = this.getEffectiveCompanyId(user);
    const userId = (user.id || user.sub)!;

    const now = new Date();
    const local = await this.getPremiumTimerTime(companyId, now);

    const employee = await this.prisma.employee.findFirst({
      where: { userId, companyId, deletedAt: null },
    });
    if (!employee) throw new NotFoundException('Employee profile not found');

    const scope = { companyId, employeeId: employee.id };
    const dates = await resolveEmployeeAttendanceDay(this.prisma, scope, now, local);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const punch = await findCurrentPunch(tx, scope, dates);
        const date = punch?.checkInTime && !punch.checkOutTime ? punch.date : dates.date;
        const existing = await findCurrentTimer(tx, scope, { ...dates, date });
        if (existing?.status === TimerStatus.RUNNING) {
          throw new BadRequestException('Timer is already running');
        }
        if (existing?.status === TimerStatus.PAUSED) {
          throw new BadRequestException('Resume the paused timer before continuing');
        }
        if (existing) {
          return tx.workTimerEntry.update({
            where: { id: existing.id, companyId, status: TimerStatus.STOPPED },
            data: {
              status: TimerStatus.RUNNING,
              activeSessionStartedAt: now,
              stoppedAt: null,
            },
          });
        }
        return tx.workTimerEntry.create({
          data: {
            ...scope,
            date,
            startedAt: now,
            status: TimerStatus.RUNNING,
          },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new ConflictException('The timer changed. Refresh it before trying again.');
      }
      throw error;
    }
  }

  async pauseTimer(user: AuthenticatedUser) {
    const companyId = this.getEffectiveCompanyId(user);
    const userId = (user.id || user.sub)!;

    const now = new Date();
    const local = await this.getPremiumTimerTime(companyId, now);

    const employee = await this.prisma.employee.findFirst({
      where: { userId, companyId, deletedAt: null },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    const scope = { companyId, employeeId: employee.id };
    const dates = await resolveEmployeeAttendanceDay(this.prisma, scope, now, local);
    const timer = await findCurrentTimer(this.prisma, scope, dates);

    if (!timer || timer.status !== TimerStatus.RUNNING) {
      throw new BadRequestException('Timer is not currently running');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.workTimerEntry.update({
        where: { id: timer.id, companyId, status: TimerStatus.RUNNING, updatedAt: timer.updatedAt },
        data: { status: TimerStatus.PAUSED },
      });
      await tx.timerBreak.create({
        data: { timerId: timer.id, startedAt: now },
      });
      return updated;
    });
  }

  async resumeTimer(user: AuthenticatedUser) {
    const companyId = this.getEffectiveCompanyId(user);
    const userId = (user.id || user.sub)!;

    const now = new Date();
    const local = await this.getPremiumTimerTime(companyId, now);

    const employee = await this.prisma.employee.findFirst({
      where: { userId, companyId, deletedAt: null },
      include: alertRelations,
    });
    if (!employee) throw new NotFoundException('Employee not found');

    const scope = { companyId, employeeId: employee.id };
    const dates = await resolveEmployeeAttendanceDay(this.prisma, scope, now, local);
    const timer = await findCurrentTimer(this.prisma, scope, dates);

    if (!timer || timer.status !== TimerStatus.PAUSED) {
      throw new BadRequestException('Timer is not paused');
    }

    // Close the latest open break
    const openBreak = timer.breaks.find((b) => b.endedAt === null);
    const currentBreakMinutes = openBreak
      ? Math.round((now.getTime() - openBreak.startedAt.getTime()) / 60000)
      : 0;
    const { updatedTimer, alert } = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.workTimerEntry.update({
        where: { id: timer.id, companyId, status: TimerStatus.PAUSED, updatedAt: timer.updatedAt },
        data: { status: TimerStatus.RUNNING },
      });
      if (openBreak) {
        await tx.timerBreak.update({
          where: { id: openBreak.id },
          data: { endedAt: now, durationMin: currentBreakMinutes },
        });
      }
      const alert = openBreak && !timer.breakAlertedAt
        ? await this.recordBreakAlert(tx, employee, timer.breaks, currentBreakMinutes, dates.shift?.breakDuration ?? 60, updated)
        : null;
      return { updatedTimer: updated, alert };
    });

    await this.deliverBreakAlert(companyId, alert);
    return updatedTimer;
  }

  async stopTimer(user: AuthenticatedUser) {
    const companyId = this.getEffectiveCompanyId(user);
    const userId = (user.id || user.sub)!;

    const now = new Date();
    const local = await this.getPremiumTimerTime(companyId, now);

    const employee = await this.prisma.employee.findFirst({
      where: { userId, companyId, deletedAt: null },
      include: alertRelations,
    });
    if (!employee) throw new NotFoundException('Employee not found');

    const scope = { companyId, employeeId: employee.id };
    const dates = await resolveEmployeeAttendanceDay(this.prisma, scope, now, local);
    const timer = await findCurrentTimer(this.prisma, scope, dates);

    if (!timer || timer.status === TimerStatus.STOPPED) {
      throw new BadRequestException('No active work timer found');
    }

    // Close any open break if stopped while paused
    const openBreak = timer.breaks.find((b) => b.endedAt === null);
    const closedBreakDuration = openBreak
      ? Math.round((now.getTime() - openBreak.startedAt.getTime()) / 60000)
      : 0;

    const sessionStart = (timer.activeSessionStartedAt ?? timer.startedAt).getTime();
    const sessionEnd = now.getTime();
    const breakMilliseconds = timer.breaks.reduce((sum, entry) => {
      const breakStart = Math.max(sessionStart, entry.startedAt.getTime());
      const breakEnd = Math.min(sessionEnd, entry.endedAt?.getTime() ?? sessionEnd);
      return sum + Math.max(0, breakEnd - breakStart);
    }, 0);
    const previousSeconds = timer.activeSessionStartedAt
      ? (timer.workedSeconds ?? timer.totalMinutes * 60)
      : 0;
    const workedSeconds = previousSeconds +
      Math.floor(Math.max(0, sessionEnd - sessionStart - breakMilliseconds) / 1000);
    const workMinutes = Math.round(workedSeconds / 60);

    // Synchronize with AttendanceRecord
    const overtimeMinutes = Math.max(0, workMinutes - shiftStandardMinutes(dates.shift));

    const { updatedTimer, alert } = await this.prisma.$transaction(async (tx) => {
      const updatedTimer = await tx.workTimerEntry.update({
        where: { id: timer.id, companyId, status: timer.status, updatedAt: timer.updatedAt },
        data: {
          activeSessionStartedAt: null,
          stoppedAt: now,
          status: TimerStatus.STOPPED,
          totalMinutes: workMinutes,
          workedSeconds,
        },
      });
      if (openBreak) {
        await tx.timerBreak.update({
          where: { id: openBreak.id },
          data: { endedAt: now, durationMin: closedBreakDuration },
        });
      }
      await tx.attendanceRecord.upsert({
        where: { companyId_employeeId_date: { ...scope, date: timer.date } },
        update: { workMinutes, overtimeMinutes },
        create: {
          ...scope,
          date: timer.date,
          workMinutes,
          overtimeMinutes,
        },
      });
      const alert = openBreak && !timer.breakAlertedAt
        ? await this.recordBreakAlert(tx, employee, timer.breaks, closedBreakDuration, dates.shift?.breakDuration ?? 60, updatedTimer)
        : null;
      return { updatedTimer, alert };
    });
    await this.deliverBreakAlert(companyId, alert);
    return updatedTimer;
  }

  async getTodayTimer(user: AuthenticatedUser) {
    const companyId = this.getEffectiveCompanyId(user);
    const userId = (user.id || user.sub)!;

    const employee = await this.prisma.employee.findFirst({
      where: { userId, companyId, deletedAt: null },
    });
    if (!employee) return null;

    const now = new Date();
    const scope = { companyId, employeeId: employee.id };
    const local = await getCompanyAttendanceTime(this.prisma, companyId, now);
    const dates = await resolveEmployeeAttendanceDay(this.prisma, scope, now, local);
    const punch = await findCurrentPunch(this.prisma, scope, dates);
    const date = punch?.checkInTime && !punch.checkOutTime ? punch.date : dates.date;
    return findCurrentTimer(this.prisma, scope, { ...dates, date });
  }
}
