'use client';

import React from 'react';
import { useAuth } from '@/lib/auth-context';
import { Users, Clock, CalendarDays, ShieldCheck, TrendingUp, Building2 } from 'lucide-react';

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-700 p-6 text-white shadow-lg shadow-blue-500/10">
        <h2 className="text-xl font-bold">
          Welcome back, {user?.firstName} {user?.lastName}!
        </h2>
        <p className="mt-1 text-sm text-blue-100">
          Role: <span className="font-semibold">{user?.role.replace('_', ' ')}</span> | Organization:{' '}
          <span className="font-semibold">{user?.company?.name || 'Platform Admin'}</span>
        </p>
        {user?.lastLoginLocation && (
          <p className="mt-2 text-xs text-blue-200">
            Security notice: You logged in from {user.lastLoginLocation}
          </p>
        )}
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Attendance</span>
            <div className="rounded-lg bg-blue-50 p-2 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">Active</p>
          <p className="mt-1 text-xs text-emerald-600">Onsite / Remote verified</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Leave Balance</span>
            <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
              <CalendarDays className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">Allocated</p>
          <p className="mt-1 text-xs text-slate-500">Casual, Sick, Annual</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Tenant Isolation</span>
            <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
              <ShieldCheck className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">Enforced</p>
          <p className="mt-1 text-xs text-indigo-600">Row-level database scope</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Subscription</span>
            <div className="rounded-lg bg-amber-50 p-2 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
            {user?.company?.subscriptionTier || 'PLATFORM'}
          </p>
          <p className="mt-1 text-xs text-amber-600">Active status</p>
        </div>
      </div>

      {/* Role-Specific Information Panel */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">
          Two-Layer Authorization Status
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Your current session is governed by <strong>Role Guard</strong> ({user?.role}) and{' '}
          <strong>Data Scope Filter</strong>. All backend services verify query row-ownership to prevent
          cross-tenant leakage.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            Tenant: {user?.companyId ? user.companyId : 'Platform Global'}
          </span>
          <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">
            Auth: httpOnly JWT + Rotating Refresh
          </span>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            Prisma Extension: Active
          </span>
        </div>
      </div>
    </div>
  );
}
