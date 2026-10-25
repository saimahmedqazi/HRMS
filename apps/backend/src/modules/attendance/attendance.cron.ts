import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AttendanceStatus, LeaveStatus } from '@prisma/client';

@Injectable()
export class AttendanceCronService {
  private readonly logger = new Logger(AttendanceCronService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Runs nightly at 23:59 UTC
  @Cron(CronExpression.EVERY_DAY_AT_11PM)
  async handleNightlyAbsenceJob() {
    this.logger.log('Starting nightly automated absence marking job...');

    const now = new Date();
    const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    // Day of week: JS 0=Sun, 1=Mon ... 6=Sat. ZenHR shift convention: 1=Mon ... 7=Sun
    const jsDay = now.getUTCDay();
    const shiftDay = jsDay === 0 ? 7 : jsDay;

    const companies = await this.prisma.company.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true },
    });

    let totalMarkedAbsent = 0;
    let totalMarkedOnLeave = 0;

    for (const company of companies) {
      // Find all active employees in this company
      const employees = await this.prisma.employee.findMany({
        where: {
          companyId: company.id,
          status: { in: ['ACTIVE', 'ON_PROBATION'] },
          deletedAt: null,
        },
        include: {
          shifts: {
            where: {
              effectiveFrom: { lte: now },
              OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
            },
            include: { shift: true },
          },
        },
      });

      for (const emp of employees) {
        // Verify employee was scheduled to work today
        const activeShift = emp.shifts[0]?.shift;
        const isScheduledToday = activeShift ? activeShift.workDays.includes(shiftDay) : shiftDay <= 5;

        if (!isScheduledToday) {
          continue; // Weekend or off-day for this employee
        }

        // Check if attendance already recorded (check-in, remote, or previous entry)
        const record = await this.prisma.attendanceRecord.findUnique({
          where: {
            companyId_employeeId_date: {
              companyId: company.id,
              employeeId: emp.id,
              date: today,
            },
          },
        });

        if (record && record.checkInTime) {
          continue; // Employee attended work
        }

        // Check if employee has approved leave covering today
        const approvedLeave = await this.prisma.leaveRequest.findFirst({
          where: {
            companyId: company.id,
            employeeId: emp.id,
            status: LeaveStatus.APPROVED,
            startDate: { lte: today },
            endDate: { gte: today },
          },
        });

        if (approvedLeave) {
          await this.prisma.attendanceRecord.upsert({
            where: {
              companyId_employeeId_date: {
                companyId: company.id,
                employeeId: emp.id,
                date: today,
              },
            },
            update: {
              status: AttendanceStatus.ON_LEAVE,
              markedBySystem: true,
              notes: 'Automatically marked ON_LEAVE from approved leave schedule',
            },
            create: {
              companyId: company.id,
              employeeId: emp.id,
              date: today,
              status: AttendanceStatus.ON_LEAVE,
              markedBySystem: true,
              notes: 'Automatically marked ON_LEAVE from approved leave schedule',
            },
          });
          totalMarkedOnLeave++;
        } else {
          // Employee did not check in and is not on approved leave -> mark ABSENT
          await this.prisma.attendanceRecord.upsert({
            where: {
              companyId_employeeId_date: {
                companyId: company.id,
                employeeId: emp.id,
                date: today,
              },
            },
            update: {
              status: AttendanceStatus.ABSENT,
              markedBySystem: true,
              notes: 'Automatically marked ABSENT by nightly cron — no check-in recorded',
            },
            create: {
              companyId: company.id,
              employeeId: emp.id,
              date: today,
              status: AttendanceStatus.ABSENT,
              markedBySystem: true,
              notes: 'Automatically marked ABSENT by nightly cron — no check-in recorded',
            },
          });
          totalMarkedAbsent++;
        }
      }
    }

    this.logger.log(
      `Nightly absence job completed: ${totalMarkedAbsent} marked absent, ${totalMarkedOnLeave} marked on leave.`,
    );
  }
}
