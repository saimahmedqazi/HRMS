'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import {
  LayoutDashboard,
  Building2,
  Users,
  GitFork,
  Clock,
  Timer,
  CalendarDays,
  CreditCard,
  FileSpreadsheet,
  PackageCheck,
  Bot,
  Settings,
  ShieldAlert,
  LogOut,
} from 'lucide-react';

interface NavItem {
  id: string;
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const ALL_NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { id: 'companies', name: 'Companies', href: '/dashboard/companies', icon: Building2 },
  { id: 'employees', name: 'Employees', href: '/dashboard/employees', icon: Users },
  { id: 'team-members', name: 'Team Members', href: '/dashboard/team-members', icon: Users },
  { id: 'departments', name: 'Departments', href: '/dashboard/departments', icon: GitFork },
  { id: 'attendance', name: 'Attendance', href: '/dashboard/attendance', icon: Clock },
  { id: 'my-attendance', name: 'My Attendance', href: '/dashboard/my-attendance', icon: Clock },
  { id: 'work-timer', name: 'Work Timer', href: '/dashboard/work-timer', icon: Timer },
  { id: 'leave', name: 'Leave Management', href: '/dashboard/leave', icon: CalendarDays },
  { id: 'my-leave', name: 'My Leave', href: '/dashboard/my-leave', icon: CalendarDays },
  { id: 'leave-approvals', name: 'Leave Approvals', href: '/dashboard/leave-approvals', icon: CalendarDays },
  { id: 'payroll', name: 'Payroll', href: '/dashboard/payroll', icon: CreditCard },
  { id: 'payroll-view', name: 'Dept Payroll', href: '/dashboard/payroll-view', icon: CreditCard },
  { id: 'my-payslips', name: 'My Payslips', href: '/dashboard/my-payslips', icon: CreditCard },
  { id: 'bulk-import', name: 'Bulk Import', href: '/dashboard/bulk-import', icon: FileSpreadsheet },
  { id: 'resources', name: 'Resource Requests', href: '/dashboard/resources', icon: PackageCheck },
  { id: 'ai-assistant', name: 'AI Assistant', href: '/dashboard/ai-assistant', icon: Bot },
  { id: 'support-mode', name: 'Support Mode', href: '/dashboard/support-mode', icon: ShieldAlert },
  { id: 'billing', name: 'Billing & Plan', href: '/dashboard/billing', icon: CreditCard },
  { id: 'settings', name: 'Settings', href: '/dashboard/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, allowedModules, logout } = useAuth();

  // Filter navigation items strictly based on server-driven allowedModules manifest
  const visibleNavItems = ALL_NAV_ITEMS.filter((item) =>
    allowedModules.includes(item.id),
  );

  return (
    <aside className="w-64 flex flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shrink-0 select-none">
      {/* Brand & Organization Header */}
      <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-6 dark:border-slate-800">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white font-bold text-lg shadow-md shadow-blue-500/20">
          Z
        </div>
        <div className="overflow-hidden">
          <h2 className="text-sm font-bold truncate text-slate-900 dark:text-white">
            {user?.company?.name || 'ZenHR Platform'}
          </h2>
          <span className="inline-block text-[10px] font-semibold tracking-wide uppercase px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
            {user?.role.replace('_', ' ')}
          </span>
        </div>
      </div>

      {/* Role-Adaptive Navigation Links */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {visibleNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.id}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className={`h-4 w-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* User Footer & Logout */}
      <div className="border-t border-slate-200 p-4 dark:border-slate-800">
        <div className="flex items-center justify-between mb-2">
          <div className="overflow-hidden pr-2">
            <p className="text-xs font-semibold truncate text-slate-800 dark:text-slate-200">
              {user ? `${user.firstName} ${user.lastName}` : 'User'}
            </p>
            <p className="text-[11px] truncate text-slate-400">{user?.email}</p>
          </div>
          <button
            onClick={() => logout()}
            title="Sign out"
            className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
        {user?.lastLoginLocation && (
          <p className="text-[10px] text-slate-400 truncate">
            Last from: {user.lastLoginLocation}
          </p>
        )}
      </div>
    </aside>
  );
}
