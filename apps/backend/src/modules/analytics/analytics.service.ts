import { Injectable, ForbiddenException } from '@nestjs/common';
import { AttendanceStatus, EmployeeStatus, SubscriptionTier, UserRole } from '@prisma/client';
import { PrismaService } from '@common/prisma/prisma.service';
import { getCompanyAttendanceTime } from '@common/utils/attendance-date';
import { findCurrentPunch, findCurrentTimer, resolveEmployeeAttendanceDay } from '@common/utils/attendance-shift';

function summarizeAttendance(records: { status: AttendanceStatus }[]) {
  return {
    present: records.filter(({ status }) => status === AttendanceStatus.PRESENT).length,
    remote: records.filter(({ status }) => status === AttendanceStatus.PRESENT_REMOTE).length,
    absent: records.filter(({ status }) => status === AttendanceStatus.ABSENT).length,
    exceptions: records.filter(({ status }) => status === AttendanceStatus.ABSENT_PENDING_REVIEW).length,
  };
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Platform-level Super Admin & Operation Manager telemetry.
   */
  async getSuperAdminMetrics() {
    const totalCompanies = await this.prisma.company.count();
    const activeCompanies = await this.prisma.company.count({ where: { status: 'ACTIVE' } });
    const totalUsers = await this.prisma.user.count();
    const totalEmployees = await this.prisma.employee.count({ where: { deletedAt: null } });

    const subPremiumCount = await this.prisma.subscription.count({
      where: { tier: SubscriptionTier.PREMIUM, status: { in: ['ACTIVE', 'TRIALING'] } },
    });
    const subBasicCount = await this.prisma.subscription.count({
      where: { tier: SubscriptionTier.BASIC, status: { in: ['ACTIVE', 'TRIALING'] } },
    });
    const pastDueSubs = await this.prisma.subscription.count({
      where: { status: 'PAST_DUE' },
    });

    const companyPremiumCount = await this.prisma.company.count({
      where: { subscriptionTier: SubscriptionTier.PREMIUM },
    });
    const companyBasicCount = await this.prisma.company.count({
      where: { subscriptionTier: SubscriptionTier.BASIC },
    });

    const premiumSubs = Math.max(subPremiumCount, companyPremiumCount);
    const basicSubs = Math.max(subBasicCount, companyBasicCount);

    const mrr = premiumSubs * 149 + basicSubs * 49;

    const companiesList =
      typeof (this.prisma.company as any).findMany === 'function'
        ? await this.prisma.company.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
              subscriptions: {
                take: 1,
                orderBy: { createdAt: 'desc' },
              },
              _count: {
                select: {
                  employees: true,
                  users: true,
                },
              },
            },
          })
        : [];

    const companySubscriptions = (companiesList || []).map((c: any) => {
      const sub = c.subscriptions?.[0];
      const start = sub?.currentPeriodStart || c.createdAt || new Date();
      const end =
        sub?.currentPeriodEnd ||
        new Date(new Date(start).getTime() + 30 * 24 * 60 * 60 * 1000);
      return {
        id: c.id,
        name: c.name,
        email: c.email,
        tier: sub?.tier || c.subscriptionTier,
        status: sub?.status || c.status,
        employees: c._count?.employees || 0,
        monthlyRate: (sub?.tier || c.subscriptionTier) === 'PREMIUM' ? 149 : 49,
        billingStartDate: start,
        nextBillingDate: end,
      };
    });

    return {
      totalCompanies,
      activeCompanies,
      totalUsers,
      totalEmployees,
      subscriptions: {
        premium: premiumSubs,
        basic: basicSubs,
        pastDue: pastDueSubs,
        estimatedMRR: mrr,
      },
      companySubscriptions,
    };
  }

  /**
   * Unified role-scoped dashboard metrics.
   */
  async getDashboardOverview(
    companyId: string,
    user: { id: string; role: UserRole; supportModeCompanyId?: string | null },
  ) {
    if (
      (user.role === UserRole.SUPER_ADMIN && !user.supportModeCompanyId) ||
      user.role === UserRole.OPERATION_MANAGER ||
      !companyId
    ) {
      return this.getSuperAdminMetrics();
    }

    const now = new Date();
    const local = await getCompanyAttendanceTime(this.prisma, companyId, now);
    const today = local.date;
    const attendanceDate = today.toISOString().slice(0, 10);

    // 1. Employee-level personal overview
    if (user.role === UserRole.EMPLOYEE) {
      const emp = await this.prisma.employee.findFirst({
        where: { companyId, userId: user.id },
      });

      let todayAttendance = null;
      let todayTimer = null;
      if (emp) {
        const scope = { companyId, employeeId: emp.id };
        const dates = await resolveEmployeeAttendanceDay(this.prisma, scope, now, local);
        todayAttendance = await findCurrentPunch(this.prisma, scope, dates);
        const date = todayAttendance?.checkInTime && !todayAttendance.checkOutTime
          ? todayAttendance.date
          : dates.date;
        todayTimer = await findCurrentTimer(this.prisma, scope, { ...dates, date });
      }

      const currentYear = today.getUTCFullYear();
      const balances = emp
        ? await this.prisma.leaveBalance.findMany({
            where: { companyId, employeeId: emp.id, year: currentYear },
          })
        : [];

      const latestPayslip = emp
        ? await this.prisma.payslip.findFirst({
            where: { companyId, employeeId: emp.id },
            orderBy: [{ year: 'desc' }, { month: 'desc' }],
          })
        : null;

      return {
        role: UserRole.EMPLOYEE,
        attendanceDate,
        todaySummary: summarizeAttendance(todayAttendance ? [todayAttendance] : []),
        todayAttendance: todayAttendance
          ? {
              date: todayAttendance.date,
              status: todayAttendance.status,
              checkIn: todayAttendance.checkInTime,
              checkOut: todayAttendance.checkOutTime,
            }
          : null,
        todayTimer: todayTimer
          ? { status: todayTimer.status, totalMinutes: todayTimer.totalMinutes }
          : null,
        leaveBalances: balances.map((b) => ({
          type: b.leaveType,
          available: b.allocated + b.carried - b.used - b.pending,
        })),
        latestPayslip: latestPayslip
          ? { id: latestPayslip.id, month: latestPayslip.month, year: latestPayslip.year, netSalary: Number(latestPayslip.netSalary) }
          : null,
      };
    }

    // 2. Team Lead Overview
    if (user.role === UserRole.TEAM_LEAD) {
      const leadEmp = await this.prisma.employee.findFirst({
        where: { companyId, userId: user.id },
      });

      const teamMembers = leadEmp?.teamId
        ? await this.prisma.employee.findMany({
            where: { companyId, teamId: leadEmp.teamId, deletedAt: null },
          })
        : leadEmp ? [leadEmp] : [];

      const teamEmpIds = teamMembers.map((m) => m.id);

      const todayTeamAttendance = await this.prisma.attendanceRecord.findMany({
        where: { companyId, employeeId: { in: teamEmpIds }, date: today },
      });

      const pendingTeamLeaves = await this.prisma.leaveRequest.count({
        where: {
          companyId,
          employeeId: { in: teamEmpIds },
          status: 'PENDING',
          step1Status: 'PENDING',
        },
      });

      const todaySummary = summarizeAttendance(todayTeamAttendance);
      return {
        role: UserRole.TEAM_LEAD,
        attendanceDate,
        todaySummary,
        teamSize: teamMembers.length,
        presentToday: todaySummary.present + todaySummary.remote,
        pendingApprovals: pendingTeamLeaves,
      };
    }

    // 3. Department Manager Overview
    if (user.role === UserRole.DEPARTMENT_MANAGER) {
      const mgrEmp = await this.prisma.employee.findFirst({
        where: { companyId, userId: user.id },
      });

      const deptEmployees = mgrEmp?.departmentId
        ? await this.prisma.employee.findMany({
            where: { companyId, departmentId: mgrEmp.departmentId, deletedAt: null },
          })
        : mgrEmp ? [mgrEmp] : [];

      const deptEmpIds = deptEmployees.map((e) => e.id);

      const deptAttendance = await this.prisma.attendanceRecord.findMany({
        where: { companyId, employeeId: { in: deptEmpIds }, date: today },
      });

      const pendingLeaves = await this.prisma.leaveRequest.count({
        where: {
          companyId,
          employeeId: { in: deptEmpIds },
          status: 'PENDING',
          step1Status: 'PENDING',
        },
      });

      const todaySummary = summarizeAttendance(deptAttendance);
      return {
        role: UserRole.DEPARTMENT_MANAGER,
        attendanceDate,
        todaySummary,
        departmentHeadcount: deptEmployees.length,
        presentToday: todaySummary.present + todaySummary.remote,
        pendingApprovals: pendingLeaves,
      };
    }

    // 4. HR Manager & Company Admin (Executive Overview)
    const totalEmployees = await this.prisma.employee.count({
      where: { companyId, deletedAt: null },
    });

    const onProbationCount = await this.prisma.employee.count({
      where: { companyId, status: EmployeeStatus.ON_PROBATION, deletedAt: null },
    });

    const todayAttendance = await this.prisma.attendanceRecord.findMany({
      where: { companyId, date: today, employee: { companyId, deletedAt: null } },
    });

    const pendingExceptions = await this.prisma.attendanceRecord.count({
      where: { companyId, status: AttendanceStatus.ABSENT_PENDING_REVIEW },
    });

    const pendingLeaveApprovals = await this.prisma.leaveRequest.count({
      where: { companyId, status: 'PENDING' },
    });

    // Department Distribution
    const departments = await this.prisma.department.findMany({
      where: { companyId, deletedAt: null },
      include: {
        _count: {
          select: { employees: { where: { deletedAt: null } } },
        },
      },
    });

    const departmentDistribution = departments.map((d) => ({
      name: d.name,
      headcount: d._count.employees,
    }));

    // 7-Day Attendance Trend
    const trend = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - i);
      const dayRecords = await this.prisma.attendanceRecord.findMany({
        where: { companyId, date: d },
      });
      trend.push({
        day: d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
        present: dayRecords.filter((r) => r.status === AttendanceStatus.PRESENT).length,
        remote: dayRecords.filter((r) => r.status === AttendanceStatus.PRESENT_REMOTE).length,
        absent: dayRecords.filter((r) => r.status === AttendanceStatus.ABSENT).length,
      });
    }

    return {
      role: user.role,
      attendanceDate,
      totalEmployees,
      onProbationCount,
      pendingExceptions,
      pendingLeaveApprovals,
      todaySummary: summarizeAttendance(todayAttendance),
      departmentDistribution,
      attendanceTrend: trend,
    };
  }
}
