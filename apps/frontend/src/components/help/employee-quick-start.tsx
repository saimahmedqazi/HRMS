'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  History,
  Timer,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';

interface SubscriptionCurrentResponse {
  subscriptionTier?: string;
  features?: {
    workTimer?: boolean;
    aiAssistant?: boolean;
  };
}

interface LeaveTypeItem {
  leaveType: string;
  isActive: boolean;
  isPaid: boolean;
}

interface RegularizationPolicyResponse {
  regularizationEnabled: boolean;
  regularizationLookback: number;
}

interface EmployeeQuickStartProps {
  userId?: string;
  role?: string;
  employeeStatus?: string | null;
  probationEndDate?: string | null;
}

export function EmployeeQuickStart({
  userId,
  role,
  employeeStatus,
  probationEndDate,
}: EmployeeQuickStartProps) {
  const storageKey = userId ? `zenhr_emp_quickstart_dismissed_${userId}` : null;
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!storageKey) return;
    try {
      setDismissed(window.localStorage.getItem(storageKey) === '1');
    } catch {
      setDismissed(false);
    }
  }, [storageKey]);

  const handleDismiss = (next: boolean) => {
    setDismissed(next);
    if (!storageKey) return;
    try {
      if (next) {
        window.localStorage.setItem(storageKey, '1');
      } else {
        window.localStorage.removeItem(storageKey);
      }
    } catch {
      // Ignore storage errors in restricted environments
    }
  };

  const { data: subData } = useQuery<SubscriptionCurrentResponse>({
    queryKey: ['quickstart-subscription'],
    queryFn: () => api.get<SubscriptionCurrentResponse>('/subscriptions/current'),
    retry: false,
  });

  const { data: leaveTypes } = useQuery<LeaveTypeItem[]>({
    queryKey: ['quickstart-leave-types'],
    queryFn: () => api.get<LeaveTypeItem[]>('/leave/types'),
    retry: false,
  });

  const { data: regPolicy } = useQuery<RegularizationPolicyResponse>({
    queryKey: ['quickstart-regularization-policy'],
    queryFn: () => api.get<RegularizationPolicyResponse>('/leave/regularization/policy'),
    retry: false,
  });

  const workTimerEnabled = Boolean(subData?.features?.workTimer);
  const additionalLeaveLabels = (leaveTypes ?? [])
    .filter((t) => t.isActive && (t.leaveType === 'SPECIAL' || t.leaveType === 'UNPAID'))
    .map((t) => (t.leaveType === 'SPECIAL' ? 'Special Leave' : 'Unpaid Leave'));
  const regularizationEnabled = Boolean(regPolicy?.regularizationEnabled);
  const leaveRoute = role === 'EMPLOYEE' ? '/dashboard/my-leave' : '/dashboard/leave';
  const attendanceRoute = role === 'EMPLOYEE' ? '/dashboard/my-attendance' : '/dashboard/attendance';

  if (dismissed) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-primary-200/80 dark:border-primary-800/60 bg-primary-50/50 dark:bg-primary-950/20 px-4 py-2.5">
        <div className="flex items-center gap-2 text-xs text-primary-900 dark:text-primary-200">
          <BookOpen className="w-4 h-4 text-primary-600 dark:text-primary-400 shrink-0" />
          <span>Need a refresher on ZenHR workflows?</span>
        </div>
        <button
          type="button"
          onClick={() => handleDismiss(false)}
          className="text-xs font-semibold text-primary-700 dark:text-primary-300 hover:underline shrink-0"
        >
          Show Quick Start Guide
        </button>
      </div>
    );
  }

  return (
    <section
      aria-label="Employee Quick Start Guide"
      className="rounded-2xl border border-primary-200 dark:border-primary-800/60 bg-white dark:bg-gray-900 p-5 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400 flex items-center justify-center shrink-0">
            <BookOpen className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">
              Quick Start Guide
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Essential daily workflows configured for your company workspace.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => handleDismiss(true)}
          aria-label="Dismiss Quick Start Guide"
          className="rounded-lg p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/40 p-3.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-900 dark:text-white">
            <Clock className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            <span>Daily Attendance & Shifts</span>
          </div>
          <p className="mt-1.5 text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
            Punch in and out daily to finalize your working hours. Check your assigned shift in{' '}
            <Link href={attendanceRoute} className="font-semibold text-primary-600 dark:text-primary-400 hover:underline">
              My Attendance
            </Link>{' '}
            or submit a Remote Work Request before working offsite.
          </p>
        </div>

        <div className="rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/40 p-3.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-900 dark:text-white">
            <CalendarDays className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span>Leave & Probation</span>
          </div>
          <p className="mt-1.5 text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
            Apply in{' '}
            <Link href={leaveRoute} className="font-semibold text-primary-600 dark:text-primary-400 hover:underline">
              My Leave
            </Link>
            .{' '}
            {employeeStatus === 'ON_PROBATION' && probationEndDate
              ? `Probation active until ${probationEndDate.slice(0, 10)}. `
              : ''}
            {additionalLeaveLabels.length > 0
              ? `When regular balances are exhausted, ${additionalLeaveLabels.join(' / ')} may be requested via Request additional leave.`
              : 'Track Step 1 and Step 2 approvals directly from your request list.'}
          </p>
        </div>

        {regularizationEnabled ? (
          <div className="rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/40 p-3.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-900 dark:text-white">
              <History className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>Regularize Absence</span>
            </div>
            <p className="mt-1.5 text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
              Missed a punch within the last {regPolicy?.regularizationLookback ?? 7} days? Use{' '}
              <Link
                href={`${leaveRoute}?regularize=1`}
                className="font-semibold text-primary-600 dark:text-primary-400 hover:underline"
              >
                Regularize absence
              </Link>{' '}
              to submit retrospective leave. Only final approval converts an absence.
            </p>
          </div>
        ) : workTimerEnabled ? (
          <div className="rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/40 p-3.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-900 dark:text-white">
              <Timer className="w-3.5 h-3.5 text-purple-500 shrink-0" />
              <span>Work Timer & Breaks</span>
            </div>
            <p className="mt-1.5 text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
              Use Start Timer, Pause Break, and Stop & Finalize in{' '}
              <Link href={attendanceRoute} className="font-semibold text-primary-600 dark:text-primary-400 hover:underline">
                My Attendance
              </Link>
              . Staying within your shift break limit prevents overstay alerts.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/40 p-3.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-900 dark:text-white">
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              <span>Notifications & Approvals</span>
            </div>
            <p className="mt-1.5 text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
              Check{' '}
              <Link href="/dashboard/notifications" className="font-semibold text-primary-600 dark:text-primary-400 hover:underline">
                Notifications
              </Link>{' '}
              for Step 1/Step 2 leave decisions, partial approval date adjustments, and attendance alerts.
            </p>
          </div>
        )}

        <div className="rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/40 p-3.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-900 dark:text-white">
            <FileText className="w-3.5 h-3.5 text-sky-500 shrink-0" />
            <span>Payslips & Profile</span>
          </div>
          <p className="mt-1.5 text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
            Download monthly statements in{' '}
            <Link href="/dashboard/my-payslips" className="font-semibold text-primary-600 dark:text-primary-400 hover:underline">
              My Payslips
            </Link>{' '}
            and review your shift schedule or emergency contact in{' '}
            <Link href="/dashboard/my-profile" className="font-semibold text-primary-600 dark:text-primary-400 hover:underline">
              Profile
            </Link>
            .
          </p>
        </div>
      </div>
    </section>
  );
}
