'use client';

import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Users,
  Building2,
  Clock,
  Calendar,
  AlertTriangle,
  Play,
  CreditCard,
  TrendingUp,
  ShieldCheck,
  CheckCircle2,
  Bot,
  Package,
  Sparkles,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

export default function DashboardHubPage() {
  const { user } = useAuth();

  const { data: overview, isLoading } = useQuery({
    queryKey: ['dashboard-overview'],
    queryFn: () => api.get<any>('/analytics/overview'),
  });

  if (isLoading || !user) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  const role = user.role;

  // 1. SUPER_ADMIN VIEW
  if (role === 'SUPER_ADMIN') {
    const stats = overview || {};
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Platform Master Console
          </h1>
          <p className="text-sm text-gray-500">
            Global multi-tenant metrics, enterprise MRR telemetry, and tenant support access.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-sm">
            <span className="text-xs uppercase text-gray-500 font-semibold">Total Tenants</span>
            <p className="text-2xl font-extrabold text-gray-900 dark:text-white mt-1">
              {stats.totalCompanies || 0}
            </p>
            <span className="text-xs text-emerald-600 font-medium">{stats.activeCompanies || 0} active</span>
          </div>

          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-sm">
            <span className="text-xs uppercase text-gray-500 font-semibold">Total Accounts</span>
            <p className="text-2xl font-extrabold text-gray-900 dark:text-white mt-1">
              {stats.totalUsers || 0}
            </p>
            <span className="text-xs text-gray-400">{stats.totalEmployees || 0} employees</span>
          </div>

          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-sm">
            <span className="text-xs uppercase text-gray-500 font-semibold">Estimated MRR</span>
            <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">
              ${(stats.subscriptions?.estimatedMRR || 0).toLocaleString()}
            </p>
            <span className="text-xs text-gray-400">{stats.subscriptions?.premium || 0} Premium tiers</span>
          </div>

          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-sm">
            <span className="text-xs uppercase text-gray-500 font-semibold">Past Due Invoices</span>
            <p className="text-2xl font-extrabold text-rose-500 mt-1">
              {stats.subscriptions?.pastDue || 0}
            </p>
            <span className="text-xs text-gray-400">3-day retry cron active</span>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 shadow-sm flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-primary-600" />
              <span>Super Admin Support Mode</span>
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Assume time-limited 1-hour audited support mode into any client company workspace.
            </p>
          </div>
          <Link
            href="/dashboard/support-mode"
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-primary-600 hover:bg-primary-700 text-white"
          >
            Launch Support Console
          </Link>
        </div>
      </div>
    );
  }

  // 2. OPERATION_MANAGER VIEW
  if (role === 'OPERATION_MANAGER') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Operations Command Center
          </h1>
          <p className="text-sm text-gray-500">
            Hardware provisioning, software licenses fulfillment, and cross-department workflows.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 shadow-sm">
            <span className="text-xs uppercase text-gray-500 font-semibold">Resource Requisitions</span>
            <p className="text-2xl font-extrabold text-primary-600 mt-1">Pending Fulfillment</p>
            <Link
              href="/dashboard/resources"
              className="text-xs text-primary-600 hover:underline inline-flex items-center gap-1 mt-2 font-medium"
            >
              Fulfill Requisitions &rarr;
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 3. COMPANY_ADMIN (CEO) VIEW
  if (role === 'COMPANY_ADMIN') {
    const stats = overview || {};
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
              Executive Dashboard
            </h1>
            <p className="text-sm text-gray-500">
              Company workforce metrics, real-time presence, and department allocation.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/billing"
              className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50"
            >
              Manage Subscription
            </Link>
          </div>
        </div>

        {/* Executive KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-sm">
            <span className="text-xs uppercase text-gray-500 font-semibold">Total Employees</span>
            <p className="text-2xl font-extrabold text-gray-900 dark:text-white mt-1">
              {stats.totalEmployees || 0}
            </p>
            <span className="text-xs text-amber-600 font-medium">
              {stats.onProbationCount || 0} on probation
            </span>
          </div>

          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-sm">
            <span className="text-xs uppercase text-gray-500 font-semibold">Present Today</span>
            <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">
              {(stats.todaySummary?.present || 0) + (stats.todaySummary?.remote || 0)}
            </p>
            <span className="text-xs text-gray-400">
              {stats.todaySummary?.remote || 0} remote authorized
            </span>
          </div>

          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-sm">
            <span className="text-xs uppercase text-gray-500 font-semibold">Pending Approvals</span>
            <p className="text-2xl font-extrabold text-primary-600 mt-1">
              {stats.pendingLeaveApprovals || 0}
            </p>
            <span className="text-xs text-gray-400">Executive leave requests</span>
          </div>

          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-sm">
            <span className="text-xs uppercase text-gray-500 font-semibold">Attendance Exceptions</span>
            <p className="text-2xl font-extrabold text-rose-500 mt-1">
              {stats.pendingExceptions || 0}
            </p>
            <span className="text-xs text-gray-400">Unauthorized absences</span>
          </div>
        </div>

        {/* Recharts Analytics Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Attendance Trends AreaChart */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">
              7-Day Workforce Attendance Trend
            </h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.attendanceTrend || []}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="present" stroke="#10B981" fill="#10B981" fillOpacity={0.2} name="Onsite" />
                  <Area type="monotone" dataKey="remote" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.2} name="Remote" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Department Distribution BarChart */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">
              Department Headcount Distribution
            </h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.departmentDistribution || []}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="headcount" fill="#4F46E5" radius={[4, 4, 0, 0]} name="Headcount" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 4. HR_MANAGER VIEW
  if (role === 'HR_MANAGER') {
    const stats = overview || {};
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
              HR Operations Hub
            </h1>
            <p className="text-sm text-gray-500">
              Workforce compliance, probation management, exceptions queue, and payroll.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/payroll"
              className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-primary-600 hover:bg-primary-700 text-white"
            >
              Execute Monthly Payroll
            </Link>
          </div>
        </div>

        {/* HR KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-sm">
            <span className="text-xs uppercase text-gray-500 font-semibold">Active Workforce</span>
            <p className="text-2xl font-extrabold text-gray-900 dark:text-white mt-1">
              {stats.totalEmployees || 0}
            </p>
            <Link href="/dashboard/employees" className="text-xs text-primary-600 hover:underline">
              Employee Directory &rarr;
            </Link>
          </div>

          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-sm">
            <span className="text-xs uppercase text-gray-500 font-semibold">On-Probation Staff</span>
            <p className="text-2xl font-extrabold text-amber-600 mt-1">
              {stats.onProbationCount || 0}
            </p>
            <span className="text-xs text-gray-400">3-month leave lock active</span>
          </div>

          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-sm">
            <span className="text-xs uppercase text-gray-500 font-semibold">Exceptions Queue</span>
            <p className="text-2xl font-extrabold text-rose-500 mt-1">
              {stats.pendingExceptions || 0}
            </p>
            <Link href="/dashboard/attendance/exceptions" className="text-xs text-rose-600 hover:underline">
              Review Exceptions &rarr;
            </Link>
          </div>

          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-sm">
            <span className="text-xs uppercase text-gray-500 font-semibold">Pending Leave Approvals</span>
            <p className="text-2xl font-extrabold text-primary-600 mt-1">
              {stats.pendingLeaveApprovals || 0}
            </p>
            <Link href="/dashboard/leave-approvals" className="text-xs text-primary-600 hover:underline">
              Open Approvals Queue &rarr;
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 5. DEPARTMENT_MANAGER VIEW
  if (role === 'DEPARTMENT_MANAGER') {
    const stats = overview || {};
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Department Management Dashboard
          </h1>
          <p className="text-sm text-gray-500">
            Team attendance tracking, leave adjudication, and department payroll summary.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 shadow-sm">
            <span className="text-xs uppercase text-gray-500 font-semibold">Department Headcount</span>
            <p className="text-2xl font-extrabold text-gray-900 dark:text-white mt-1">
              {stats.departmentHeadcount || 0}
            </p>
            <span className="text-xs text-emerald-600 font-medium">
              {stats.presentToday || 0} present today
            </span>
          </div>

          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 shadow-sm">
            <span className="text-xs uppercase text-gray-500 font-semibold">Department Leaves</span>
            <p className="text-2xl font-extrabold text-primary-600 mt-1">
              {stats.pendingApprovals || 0}
            </p>
            <Link href="/dashboard/leave-approvals" className="text-xs text-primary-600 hover:underline">
              Adjudicate Requests &rarr;
            </Link>
          </div>

          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 shadow-sm">
            <span className="text-xs uppercase text-gray-500 font-semibold">Department Payroll</span>
            <p className="text-sm font-bold text-gray-800 dark:text-gray-200 mt-2">
              Aggregated Expenditure Overview
            </p>
            <Link href="/dashboard/payroll-view" className="text-xs text-primary-600 hover:underline block mt-2">
              View Department Payroll Summary &rarr;
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 6. TEAM_LEAD VIEW
  if (role === 'TEAM_LEAD') {
    const stats = overview || {};
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Team Squad Command
          </h1>
          <p className="text-sm text-gray-500">
            Squad attendance, live Work Timer monitoring, break alerts, and leave sign-offs.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 shadow-sm">
            <span className="text-xs uppercase text-gray-500 font-semibold">Squad Size</span>
            <p className="text-2xl font-extrabold text-gray-900 dark:text-white mt-1">
              {stats.teamSize || 0} members
            </p>
            <span className="text-xs text-emerald-600 font-medium">
              {stats.presentToday || 0} checked in today
            </span>
          </div>

          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 shadow-sm">
            <span className="text-xs uppercase text-gray-500 font-semibold">Pending Squad Leaves</span>
            <p className="text-2xl font-extrabold text-primary-600 mt-1">
              {stats.pendingApprovals || 0}
            </p>
            <Link href="/dashboard/leave-approvals" className="text-xs text-primary-600 hover:underline">
              Review Step 1 Submissions &rarr;
            </Link>
          </div>

          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 shadow-sm">
            <span className="text-xs uppercase text-gray-500 font-semibold">Break Overstay Alerts</span>
            <p className="text-xs text-gray-500 mt-2">
              WebSocket alerts broadcast instantly if any team member exceeds 60m of break time.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 7. EMPLOYEE (DEFAULT) VIEW
  const empStats = overview || {};
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
          My Workplace
        </h1>
        <p className="text-sm text-gray-500">
          Your daily punch clock, active work timer, leave balances, and payslips.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Attendance Widget */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs uppercase font-semibold">Today&apos;s Attendance</span>
            <Clock className="w-4 h-4" />
          </div>
          <p className="text-lg font-bold text-gray-900 dark:text-white mt-1">
            {empStats.todayAttendance?.status || 'NOT_CHECKED_IN'}
          </p>
          <Link href="/dashboard/attendance" className="text-xs text-primary-600 hover:underline mt-2 inline-block">
            Punch Widget &rarr;
          </Link>
        </div>

        {/* Work Timer Widget */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs uppercase font-semibold">Work Timer</span>
            <Play className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-lg font-bold text-gray-900 dark:text-white mt-1">
            {empStats.todayTimer?.status || 'STOPPED'}
          </p>
          <span className="text-xs text-gray-400">
            {empStats.todayTimer?.totalMinutes || 0} min logged
          </span>
        </div>

        {/* Leave Balances Widget */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs uppercase font-semibold">Leave Balances</span>
            <Calendar className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-2 mt-1">
            {empStats.leaveBalances?.map((b: any) => (
              <span key={b.type} className="text-xs font-semibold px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800">
                {b.type[0]}: {b.available}d
              </span>
            ))}
          </div>
          <Link href="/dashboard/leave" className="text-xs text-primary-600 hover:underline mt-2 inline-block">
            Request Leave &rarr;
          </Link>
        </div>

        {/* Latest Payslip */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs uppercase font-semibold">Latest Payslip</span>
            <CreditCard className="w-4 h-4" />
          </div>
          <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1">
            {empStats.latestPayslip ? `$${empStats.latestPayslip.netSalary.toLocaleString()}` : '—'}
          </p>
          <Link href="/dashboard/my-payslips" className="text-xs text-primary-600 hover:underline mt-2 inline-block">
            Download Payslip PDF &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}
