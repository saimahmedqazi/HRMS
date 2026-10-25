import { Injectable, ForbiddenException } from '@nestjs/common';
import { AttendanceStatus, EmployeeStatus, SubscriptionTier, UserRole } from '@prisma/client';
import { PrismaService } from '@common/prisma/prisma.service';

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

    const premiumSubs = await this.prisma.subscription.count({
      where: { tier: SubscriptionTier.PREMIUM, status: 'ACTIVE' },
    });
    const basicSubs = await this.prisma.subscription.count({
      where: { tier: SubscriptionTier.BASIC, status: 'ACTIVE' },
    });
    const pastDueSubs = await this.prisma.subscription.count({
      where: { status: 'PAST_DUE' },
    });

    const mrr = premiumSubs * 149 + basicSubs * 49;

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
    };
  }

  /**
   * Unified role-scoped dashboard metrics.
   */
  async getDashboardOverview(
    companyId: string,
    user: { id: string; role: UserRole },
  ) {
    if (user.role === UserRole.SUPER_ADMIN) {
      return this.getSuperAdminMetrics();
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // 1. Employee-level personal overview
    if (user.role === UserRole.EMPLOYEE) {
      const emp = await this.prisma.employee.findFirst({
        where: { companyId, userId: user.id },
      });

      const todayAttendance = emp
        ? await this.prisma.attendanceRecord.findFirst({
            where: { companyId, employeeId: emp.id, date: today },
          })
        : null;

      const todayTimer = emp
        ? await this.prisma.workTimerEntry.findFirst({
            where: { companyId, employeeId: emp.id, date: today },
            include: { breaks: true },
          })
        : null;

      const currentYear = new Date().getFullYear();
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
        todayAttendance: todayAttendance
          ? { status: todayAttendance.status, checkIn: todayAttendance.checkInTime, checkOut: todayAttendance.checkOutTime }
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
        : [];

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

      return {
        role: UserRole.TEAM_LEAD,
        teamSize: teamMembers.length,
        presentToday: todayTeamAttendance.filter(
          (a) => a.status === AttendanceStatus.PRESENT || a.status === AttendanceStatus.PRESENT_REMOTE,
        ).length,
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
        : [];

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

      return {
        role: UserRole.DEPARTMENT_MANAGER,
        departmentHeadcount: deptEmployees.length,
        presentToday: deptAttendance.filter(
          (a) => a.status === AttendanceStatus.PRESENT || a.status === AttendanceStatus.PRESENT_REMOTE,
        ).length,
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
      where: { companyId, date: today },
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
          select: { employees: true },
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
      d.setDate(d.getDate() - i);
      const dayRecords = await this.prisma.attendanceRecord.findMany({
        where: { companyId, date: d },
      });
      trend.push({
        day: d.toLocaleDateString('en-US', { weekday: 'short' }),
        present: dayRecords.filter((r) => r.status === AttendanceStatus.PRESENT).length,
        remote: dayRecords.filter((r) => r.status === AttendanceStatus.PRESENT_REMOTE).length,
        absent: dayRecords.filter((r) => r.status === AttendanceStatus.ABSENT).length,
      });
    }

    return {
      role: user.role,
      totalEmployees,
      onProbationCount,
      pendingExceptions,
      pendingLeaveApprovals,
      todaySummary: {
        present: todayAttendance.filter((r) => r.status === AttendanceStatus.PRESENT).length,
        remote: todayAttendance.filter((r) => r.status === AttendanceStatus.PRESENT_REMOTE).length,
        absent: todayAttendance.filter((r) => r.status === AttendanceStatus.ABSENT).length,
      },
      departmentDistribution,
      attendanceTrend: trend,
    };
  }
}
