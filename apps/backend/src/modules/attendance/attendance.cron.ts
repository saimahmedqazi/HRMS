import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { getAttendanceDay, previousAttendanceDate } from '../../common/utils/attendance-date';
import { activeShiftWhere, overnightShiftEnd } from '../../common/utils/attendance-shift';
import { AttendanceStatus, LeaveStatus } from '@prisma/client';

@Injectable()
export class AttendanceCronService {
  private readonly logger = new Logger(AttendanceCronService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Run at the first hourly tick after each tenant's shift cutoff.
  @Cron(CronExpression.EVERY_HOUR)
  async handleNightlyAbsenceJob() {
    const now = new Date();

    const companies = await this.prisma.company.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        timezone: true,
        shifts: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: { startTime: true, endTime: true, workDays: true, breakDuration: true, isDefault: true },
        },
      },
    });

    let totalMarkedAbsent = 0;
    let totalMarkedOnLeave = 0;

    for (const company of companies) {
      const local = getAttendanceDay(now, company.timezone);
      const previousTick = getAttendanceDay(new Date(now.getTime() - 3600000), company.timezone);
      const minutes = local.hour * 60 + local.minute;
      const previousMinutes = previousTick.date.getTime() === local.date.getTime()
        ? previousTick.hour * 60 + previousTick.minute
        : -1;
      const isDue = (cutoff: number) => previousMinutes < cutoff && cutoff <= minutes;
      if (!isDue(0) && !company.shifts.some((shift) => {
        const end = overnightShiftEnd(shift);
        return end !== null && isDue(end);
      })) continue;

      const date = previousAttendanceDate(local.date);
      const shiftDay = date.getUTCDay() || 7;
      const defaultShift = company.shifts.find((shift) => shift.isDefault);

      // Hire dates use UTC calendar dates, while the workday comes from the tenant's timezone.
      const employees = await this.prisma.employee.findMany({
        where: {
          companyId: company.id,
          status: { in: ['ACTIVE', 'ON_PROBATION'] },
          deletedAt: null,
          hireDate: { lt: local.date },
        },
        include: {
          shifts: {
            where: activeShiftWhere(now, company.id),
            orderBy: [{ effectiveFrom: 'desc' }, { id: 'asc' }],
            take: 1,
            include: { shift: true },
          },
        },
      });

      for (const emp of employees) {
        const activeShift = emp.shifts[0]?.shift ?? defaultShift;
        const scheduled = activeShift ? activeShift.workDays.includes(shiftDay) : shiftDay <= 5;
        if (!scheduled || !isDue(overnightShiftEnd(activeShift) ?? 0)) continue;

        const key = { companyId: company.id, employeeId: emp.id, date };
        const record = await this.prisma.attendanceRecord.findUnique({
          where: { companyId_employeeId_date: key },
        });
        if (record && (record.checkInTime || !record.markedBySystem || record.status !== AttendanceStatus.ABSENT)) continue;

        // Check if employee has approved leave covering today
        const approvedLeave = await this.prisma.leaveRequest.findFirst({
          where: {
            companyId: company.id,
            employeeId: emp.id,
            status: LeaveStatus.APPROVED,
            startDate: { lte: date },
            endDate: { gte: date },
          },
        });

        if (!approvedLeave) {
          const remotePermission = await this.prisma.remoteWorkPermission.findFirst({
            where: {
              companyId: company.id,
              employeeId: emp.id,
              status: 'APPROVED',
              startDate: { lte: date },
              endDate: { gte: date },
            },
            select: { id: true },
          });
          if (remotePermission) continue;
        }

        const data = {
          status: approvedLeave ? AttendanceStatus.ON_LEAVE : AttendanceStatus.ABSENT,
          markedBySystem: true,
          notes: approvedLeave
            ? 'Automatically marked ON_LEAVE from approved leave schedule'
            : 'Automatically marked ABSENT after shift cutoff without a check-in',
        };
        const updated = approvedLeave ? await this.prisma.attendanceRecord.updateMany({
          where: {
            ...key,
            checkInTime: null,
            markedBySystem: true,
            status: AttendanceStatus.ABSENT,
          },
          data,
        }) : null;
        const count = updated?.count || (await this.prisma.attendanceRecord.createMany({
          data: { ...key, ...data },
          skipDuplicates: true,
        })).count;
        if (approvedLeave) totalMarkedOnLeave += count;
        else totalMarkedAbsent += count;
      }
    }

    if (totalMarkedAbsent || totalMarkedOnLeave) {
      this.logger.log(`Marked ${totalMarkedAbsent} absent and ${totalMarkedOnLeave} on leave.`);
    }
  }
}
