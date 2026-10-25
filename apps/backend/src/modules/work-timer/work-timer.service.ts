import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MailService } from '../../common/mail/mail.service';
import { AttendanceGateway } from '../attendance/attendance.gateway';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import {
  SubscriptionTier,
  TimerStatus,
  NotificationType,
  UserRole,
} from '@prisma/client';

@Injectable()
export class WorkTimerService {
  private readonly logger = new Logger(WorkTimerService.name);

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

  private getTodayDate(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  }

  private async verifyPremiumTier(companyId: string): Promise<void> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { subscriptionTier: true },
    });

    if (!company || company.subscriptionTier !== SubscriptionTier.PREMIUM) {
      throw new ForbiddenException(
        'The Work Timer is a ZenHR Premium tier feature. Please upgrade your company subscription to enable real-time timer tracking.',
      );
    }
  }

  async startTimer(user: AuthenticatedUser) {
    const companyId = this.getEffectiveCompanyId(user);
    const userId = (user.id || user.sub)!;

    await this.verifyPremiumTier(companyId);

    const employee = await this.prisma.employee.findFirst({
      where: { userId, companyId, deletedAt: null },
    });
    if (!employee) throw new NotFoundException('Employee profile not found');

    const today = this.getTodayDate();

    // Look for existing timer today
    const existing = await this.prisma.workTimerEntry.findFirst({
      where: { companyId, employeeId: employee.id, date: today },
      include: { breaks: true },
    });

    if (existing) {
      if (existing.status === TimerStatus.RUNNING) {
        throw new BadRequestException('Timer is already running');
      }
      return this.prisma.workTimerEntry.update({
        where: { id: existing.id },
        data: { status: TimerStatus.RUNNING },
      });
    }

    // Create new timer entry
    return this.prisma.workTimerEntry.create({
      data: {
        companyId,
        employeeId: employee.id,
        date: today,
        startedAt: new Date(),
        status: TimerStatus.RUNNING,
      },
    });
  }

  async pauseTimer(user: AuthenticatedUser) {
    const companyId = this.getEffectiveCompanyId(user);
    const userId = (user.id || user.sub)!;

    await this.verifyPremiumTier(companyId);

    const employee = await this.prisma.employee.findFirst({
      where: { userId, companyId, deletedAt: null },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    const today = this.getTodayDate();
    const timer = await this.prisma.workTimerEntry.findFirst({
      where: { companyId, employeeId: employee.id, date: today },
    });

    if (!timer || timer.status !== TimerStatus.RUNNING) {
      throw new BadRequestException('Timer is not currently running');
    }

    // Create break record and update timer status
    await this.prisma.timerBreak.create({
      data: {
        timerId: timer.id,
        startedAt: new Date(),
      },
    });

    return this.prisma.workTimerEntry.update({
      where: { id: timer.id },
      data: { status: TimerStatus.PAUSED },
    });
  }

  async resumeTimer(user: AuthenticatedUser) {
    const companyId = this.getEffectiveCompanyId(user);
    const userId = (user.id || user.sub)!;

    await this.verifyPremiumTier(companyId);

    const employee = await this.prisma.employee.findFirst({
      where: { userId, companyId, deletedAt: null },
      include: {
        department: { select: { id: true, name: true, managerId: true } },
        team: { select: { id: true, name: true, leadId: true } },
        shifts: {
          include: { shift: true },
          take: 1,
        },
      },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    const today = this.getTodayDate();
    const timer = await this.prisma.workTimerEntry.findFirst({
      where: { companyId, employeeId: employee.id, date: today },
      include: { breaks: true },
    });

    if (!timer || timer.status !== TimerStatus.PAUSED) {
      throw new BadRequestException('Timer is not paused');
    }

    // Close the latest open break
    const openBreak = timer.breaks.find((b) => b.endedAt === null);
    const now = new Date();
    let currentBreakMinutes = 0;

    if (openBreak) {
      currentBreakMinutes = Math.round((now.getTime() - openBreak.startedAt.getTime()) / 60000);
      await this.prisma.timerBreak.update({
        where: { id: openBreak.id },
        data: {
          endedAt: now,
          durationMin: currentBreakMinutes,
        },
      });
    }

    // Calculate total accumulated break minutes today
    const previousBreaksMinutes = timer.breaks
      .filter((b) => b.endedAt !== null)
      .reduce((sum, b) => sum + (b.durationMin || 0), 0);
    const totalBreakMinutes = previousBreaksMinutes + currentBreakMinutes;

    // Shift allowed break threshold (default 60m)
    const allowedBreak = employee.shifts[0]?.shift?.breakDuration || 60;

    // Check for break overstay
    if (totalBreakMinutes > allowedBreak) {
      this.logger.warn(
        `Break threshold exceeded for ${employee.firstName} ${employee.lastName}: ${totalBreakMinutes}m vs allowed ${allowedBreak}m`,
      );

      const alertPayload = {
        employeeId: employee.id,
        employeeName: `${employee.firstName} ${employee.lastName}`,
        departmentName: employee.department?.name,
        shiftBreakLimit: allowedBreak,
        actualBreakMinutes: totalBreakMinutes,
        timestamp: new Date().toISOString(),
      };

      // 1. Broadcast real-time WebSocket alert
      this.gateway.broadcastBreakAlert(
        companyId,
        employee.team?.leadId || undefined,
        employee.department?.managerId || undefined,
        alertPayload,
      );

      // 2. Fetch stakeholders for email and in-app notifications
      const stakeholders = await this.prisma.user.findMany({
        where: {
          companyId,
          OR: [
            { role: UserRole.COMPANY_ADMIN },
            { id: employee.department?.managerId || 'none' },
            { id: employee.team?.leadId || 'none' },
          ],
        },
        select: { id: true, email: true },
      });

      for (const sh of stakeholders) {
        // In-app notification
        await this.prisma.notification.create({
          data: {
            companyId,
            userId: sh.id,
            type: NotificationType.BREAK_ALERT,
            title: `Excessive Break Alert: ${employee.firstName} ${employee.lastName}`,
            body: `${employee.firstName} ${employee.lastName} took ${totalBreakMinutes} minutes of break (allowed: ${allowedBreak}m).`,
            data: { employeeId: employee.id, totalBreakMinutes, allowedBreak },
          },
        });

        // Email notification
        await this.mailService.sendMail({
          to: sh.email,
          subject: `ZenHR Alert: Excessive Break (${employee.firstName} ${employee.lastName})`,
          html: `
            <div style="font-family: sans-serif;">
              <h3 style="color: #dc2626;">Break Duration Threshold Exceeded</h3>
              <p><strong>Employee:</strong> ${employee.firstName} ${employee.lastName} (${employee.employeeCode})</p>
              <p><strong>Department:</strong> ${employee.department?.name || 'N/A'}</p>
              <p><strong>Allowed Break:</strong> ${allowedBreak} minutes</p>
              <p><strong>Actual Break:</strong> <span style="color: #dc2626; font-weight: bold;">${totalBreakMinutes} minutes</span></p>
            </div>
          `,
        });
      }
    }

    return this.prisma.workTimerEntry.update({
      where: { id: timer.id },
      data: { status: TimerStatus.RUNNING },
    });
  }

  async stopTimer(user: AuthenticatedUser) {
    const companyId = this.getEffectiveCompanyId(user);
    const userId = (user.id || user.sub)!;

    await this.verifyPremiumTier(companyId);

    const employee = await this.prisma.employee.findFirst({
      where: { userId, companyId, deletedAt: null },
      include: { shifts: { include: { shift: true }, take: 1 } },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    const today = this.getTodayDate();
    const timer = await this.prisma.workTimerEntry.findFirst({
      where: { companyId, employeeId: employee.id, date: today },
      include: { breaks: true },
    });

    if (!timer) throw new BadRequestException('No active timer found today');

    const now = new Date();
    // Close any open break if stopped while paused
    const openBreak = timer.breaks.find((b) => b.endedAt === null);
    if (openBreak) {
      await this.prisma.timerBreak.update({
        where: { id: openBreak.id },
        data: {
          endedAt: now,
          durationMin: Math.round((now.getTime() - openBreak.startedAt.getTime()) / 60000),
        },
      });
    }

    // Calculate total duration from startedAt to now minus total break duration
    const totalElapsedMinutes = Math.round((now.getTime() - timer.startedAt.getTime()) / 60000);
    const totalBreakMinutes = timer.breaks.reduce((sum, b) => sum + (b.durationMin || 0), 0);
    const workMinutes = Math.max(0, totalElapsedMinutes - totalBreakMinutes);

    const updatedTimer = await this.prisma.workTimerEntry.update({
      where: { id: timer.id },
      data: {
        stoppedAt: now,
        status: TimerStatus.STOPPED,
        totalMinutes: workMinutes,
      },
    });

    // Synchronize with AttendanceRecord
    const standardWorkMinutes = 480; // 8 hours
    const overtimeMinutes = Math.max(0, workMinutes - standardWorkMinutes);

    await this.prisma.attendanceRecord.upsert({
      where: {
        companyId_employeeId_date: {
          companyId,
          employeeId: employee.id,
          date: today,
        },
      },
      update: {
        workMinutes,
        overtimeMinutes,
        checkOutTime: now,
      },
      create: {
        companyId,
        employeeId: employee.id,
        date: today,
        checkInTime: timer.startedAt,
        checkOutTime: now,
        workMinutes,
        overtimeMinutes,
      },
    });

    return updatedTimer;
  }

  async getTodayTimer(user: AuthenticatedUser) {
    const companyId = this.getEffectiveCompanyId(user);
    const userId = (user.id || user.sub)!;

    const employee = await this.prisma.employee.findFirst({
      where: { userId, companyId, deletedAt: null },
    });
    if (!employee) return null;

    const today = this.getTodayDate();

    return this.prisma.workTimerEntry.findFirst({
      where: { companyId, employeeId: employee.id, date: today },
      include: { breaks: true },
    });
  }
}
