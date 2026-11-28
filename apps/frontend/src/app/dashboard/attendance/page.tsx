'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { formatWorkDuration } from '@/lib/attendance-duration';
import { useAuth, type UserProfile } from '@/lib/auth-context';
import { StatusBadge } from '@/components/ui/status-badge';
import { ContextualHelpTip } from '@/components/help/contextual-help-tip';
import {
  Clock,
  MapPin,
  Laptop,
  Play,
  Pause,
  Square,
  AlertTriangle,
  History,
  CheckCircle,
  Calendar,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  Globe,
  ShieldCheck,
  Plus,
  Trash2,
  Home,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import {
  ChartTooltipContent,
  CHART_TOOLTIP_CURSOR,
} from '@/components/ui/chart-tooltip';

const reportCategories = [
  { key: 'present', name: 'Present (Onsite)', color: '#10B981' },
  { key: 'remote', name: 'Present (Remote)', color: '#3B82F6' },
  { key: 'absent', name: 'Absent', color: '#F43F5E' },
  { key: 'halfDay', name: 'Half Day', color: '#8B5CF6' },
  { key: 'exceptions', name: 'Exceptions / Pending', color: '#F59E0B' },
  { key: 'leave', name: 'Approved Leave', color: '#6366F1' },
] as const;

type ReportingPeriod = 'today' | 'week' | 'month' | 'historical';

function countAttendance(records: { status: string; isRemote?: boolean }[]) {
  const totals = { present: 0, remote: 0, absent: 0, halfDay: 0, exceptions: 0, leave: 0 };
  for (const { status, isRemote } of records) {
    switch (status) {
      case 'PRESENT': totals[isRemote ? 'remote' : 'present']++; break;
      case 'PRESENT_REMOTE': totals.remote++; break;
      case 'ABSENT': totals.absent++; break;
      case 'HALF_DAY': totals.halfDay++; break;
      case 'ABSENT_PENDING_REVIEW':
      case 'MISSING_CHECKOUT': totals.exceptions++; break;
      case 'ON_LEAVE': totals.leave++; break;
    }
  }
  return totals;
}

const dateKey = (date: Date) => date.toISOString().slice(0, 10);
const dayMs = 86_400_000;

const calendarStatus: Record<string, string> = {
  PRESENT: 'Present',
  IN_PROGRESS: 'Checked in',
  HALF_DAY: 'Half day',
  MISSING_CHECKOUT: 'Missing checkout',
  PRESENT_REMOTE: 'Remote',
  ABSENT: 'Absent',
  ABSENT_PENDING_REVIEW: 'Review',
  ON_LEAVE: 'Leave',
  HOLIDAY: 'Holiday',
  WEEKEND: 'Off',
};

const dayNames = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function formatShiftTime(hhmm?: string): string {
  if (!hhmm) return '—';
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

function formatWorkDays(days?: number[]): string {
  if (!days || days.length === 0) return 'Mon – Fri';
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 5 && sorted[0] === 1 && sorted[4] === 5) return 'Mon – Fri';
  if (sorted.length === 6 && sorted[0] === 1 && sorted[5] === 6) return 'Mon – Sat';
  return sorted.map((d) => dayNames[d] || String(d)).join(', ');
}

function getPunchLocation(userId: string): Promise<{ latitude: number; longitude: number } | undefined> {
  if (!navigator.geolocation) return Promise.resolve(undefined);

  return new Promise((resolve) => {
    const controller = new AbortController();
    // Bound the total wait, including a browser permission prompt.
    const timeout = window.setTimeout(() => {
      controller.abort();
      resolve(undefined);
    }, 3000);
    const finish = (position?: GeolocationPosition) => {
      window.clearTimeout(timeout);
      if (controller.signal.aborted) return;
      resolve(position ? {
        latitude: Number(position.coords.latitude.toFixed(6)),
        longitude: Number(position.coords.longitude.toFixed(6)),
      } : undefined);
    };

    // A different tab or device may have withdrawn consent since this page loaded.
    api.get<UserProfile>('/auth/me', { cache: 'no-store', signal: controller.signal })
      .then((profile) => {
        if (controller.signal.aborted) return;
        if (profile.id === userId && profile.employee?.locationConsent) {
          navigator.geolocation.getCurrentPosition(finish, () => finish(), { timeout: 3000 });
        } else {
          finish();
        }
      })
      .catch(() => finish());
  });
}

export default function AttendanceDashboardPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const hasEmployeeContext = Boolean(user?.employee?.id);
  const canUseTimer = hasEmployeeContext && (user?.supportModeCompany ?? user?.company)?.subscriptionTier === 'PREMIUM';
  const isHrOrAdmin =
    user?.role === 'SUPER_ADMIN' ||
    user?.role === 'COMPANY_ADMIN' ||
    user?.role === 'HR_MANAGER';
  const [isRemote, setIsRemote] = useState(false);
  const [notes, setNotes] = useState('');
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerError, setTimerError] = useState<Error | null>(null);
  const [newWhitelistIp, setNewWhitelistIp] = useState('');
  const [newWhitelistDesc, setNewWhitelistDesc] = useState('');
  const [showRemoteModal, setShowRemoteModal] = useState(false);
  const [remoteStartDate, setRemoteStartDate] = useState('');
  const [remoteEndDate, setRemoteEndDate] = useState('');
  const [remoteReason, setRemoteReason] = useState('');
  const [period, setPeriod] = useState<ReportingPeriod>('month');
  const [selectedMonth, setCalendarMonth] = useState<Date | null>(null);
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Fetch today's attendance
  const attendanceQuery = useQuery({
    queryKey: ['attendance-today', user?.id, user?.supportModeCompanyId ?? user?.companyId, user?.employee?.id],
    queryFn: () => api.get<any>('/attendance/today'),
    enabled: hasEmployeeContext,
    refetchInterval: 60_000,
  });

  // Fetch today's work timer
  const timerQuery = useQuery({
    queryKey: ['timer-today', user?.id, user?.supportModeCompanyId ?? user?.companyId, user?.employee?.id],
    queryFn: () => api.get<any>('/timer/today'),
    enabled: canUseTimer,
    refetchInterval: 60_000,
  });

  // Fetch dashboard overview for 7-day trend & headcount
  const overviewQuery = useQuery({
    queryKey: ['dashboard-overview', user?.id, user?.supportModeCompanyId ?? user?.companyId, user?.role],
    enabled: Boolean(user),
    queryFn: () => api.get<any>('/analytics/overview'),
    refetchInterval: 60_000,
  });

  // Fetch IP Whitelist & current client IP telemetry
  const { data: whitelistData, isLoading: isWhitelistLoading, error: whitelistError, refetch: refetchWhitelist } = useQuery({
    queryKey: ['attendance-ip-whitelist'],
    queryFn: () => api.get<any>('/attendance/ip-whitelist'),
  });

  // Fetch remote work permissions
  const { data: remotePermissions = [] } = useQuery({
    queryKey: ['remote-permissions'],
    queryFn: () => api.get<any[]>('/attendance/remote-permissions'),
  });

  const overviewData = overviewQuery.data;
  const attendance = attendanceQuery.data;
  const attendanceDate: string | undefined = overviewData?.attendanceDate;
  const shiftDate = attendance?.date?.slice(0, 10);
  const overnightShiftDate = shiftDate && attendanceDate && shiftDate !== attendanceDate ? shiftDate : null;
  const calendarMonth = selectedMonth ?? (attendanceDate
    ? new Date(`${attendanceDate}T12:00:00`)
    : new Date());
  const timer = timerQuery.data;
  const currentLatitude = whitelistData?.currentGeo?.latitude;
  const currentLongitude = whitelistData?.currentGeo?.longitude;
  const monthStart = dateKey(new Date(Date.UTC(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1)));
  const monthEnd = dateKey(new Date(Date.UTC(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0)));
  const today = Date.parse(attendanceDate ?? monthStart);
  const weekStart = today - ((new Date(today).getUTCDay() + 6) % 7) * dayMs;
  const reportStart = period === 'today' ? dateKey(new Date(today))
    : period === 'week' ? dateKey(new Date(weekStart)) : monthStart;
  const reportEnd = period === 'today' ? reportStart
    : period === 'week' ? dateKey(new Date(weekStart + 6 * dayMs)) : monthEnd;
  const startDate = reportStart < monthStart ? reportStart : monthStart;
  const endDate = reportEnd > monthEnd ? reportEnd : monthEnd;
  const recordsQuery = useQuery({
    queryKey: ['attendance-records', user?.id, user?.supportModeCompanyId ?? user?.companyId, user?.role, startDate, endDate],
    queryFn: ({ signal }) => api.get<any>('/attendance/records?' + new URLSearchParams({ startDate, endDate }), { signal }),
    enabled: Boolean(user && attendanceDate),
  });
  const recordsData = recordsQuery.data;
  const recordsList: any[] = Array.isArray(recordsData)
    ? recordsData
    : recordsData?.data || [];

  // Local clock ticker for running timer
  useEffect(() => {
    if (!timer || timer.status === 'STOPPED') {
      setTimerSeconds(timer?.workedSeconds ?? (timer?.totalMinutes ?? 0) * 60);
      return;
    }
    const startTime = Date.parse(timer.activeSessionStartedAt ?? timer.startedAt);
    const previousSeconds = timer.activeSessionStartedAt
      ? (timer.workedSeconds ?? timer.totalMinutes * 60)
      : 0;
    const breaks: { startedAt: string; endedAt: string | null }[] = timer.breaks ?? [];
    const pausedAt = breaks.find((entry) => entry.endedAt === null)?.startedAt;
    const update = () => {
      const until = timer.status === 'PAUSED' && pausedAt ? Date.parse(pausedAt) : Date.now();
      const breaksTotalMs = breaks.reduce((sum, entry) => {
        const breakStart = Math.max(startTime, Date.parse(entry.startedAt));
        const breakEnd = Math.min(until, entry.endedAt ? Date.parse(entry.endedAt) : until);
        return sum + Math.max(0, breakEnd - breakStart);
      }, 0);
      setTimerSeconds(previousSeconds + Math.floor(Math.max(0, until - startTime - breaksTotalMs) / 1000));
    };
    update();
    if (timer.status !== 'RUNNING') return;
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [timer]);

  // Mutations
  const checkInMutation = useMutation({
    mutationFn: async () => {
      const location = user?.employee?.locationConsent
        ? await getPunchLocation(user.id)
        : undefined;
      return api.post('/attendance/check-in', {
        isRemote,
        notes: notes || undefined,
        ...location,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance-today'] });
      queryClient.invalidateQueries({ queryKey: ['attendance-records'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] });
      setNotes('');
    },
  });

  const addWhitelistMutation = useMutation({
    mutationFn: (payload: { ipAddress: string; description?: string }) =>
      api.post('/attendance/ip-whitelist', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance-ip-whitelist'] });
      setNewWhitelistIp('');
      setNewWhitelistDesc('');
    },
  });

  const removeWhitelistMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/attendance/ip-whitelist/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance-ip-whitelist'] });
    },
  });

  const createRemoteMutation = useMutation({
    mutationFn: () =>
      api.post('/attendance/remote-permissions', {
        startDate: remoteStartDate,
        endDate: remoteEndDate,
        reason: remoteReason,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remote-permissions'] });
      setShowRemoteModal(false);
      setRemoteStartDate('');
      setRemoteEndDate('');
      setRemoteReason('');
      setActionFeedback({ type: 'success', message: 'Remote work request submitted successfully.' });
    },
    onError: () => queryClient.invalidateQueries({ queryKey: ['remote-permissions'] }),
  });

  const step1ApproveMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/attendance/remote-permissions/${id}/step1`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remote-permissions'] });
      setActionFeedback({ type: 'success', message: 'Step 1 recommendation recorded.' });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        void queryClient.invalidateQueries({ queryKey: ['remote-permissions'] });
      }
      setActionFeedback({ type: 'error', message: err.message || 'Failed to approve Step 1.' });
    },
  });

  const step2ApproveMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/attendance/remote-permissions/${id}/step2`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remote-permissions'] });
      setActionFeedback({ type: 'success', message: 'Step 2 approval granted.' });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        void queryClient.invalidateQueries({ queryKey: ['remote-permissions'] });
      }
      setActionFeedback({ type: 'error', message: err.message || 'Failed to approve Step 2.' });
    },
  });

  const checkOutMutation = useMutation({
    mutationFn: () => api.post('/attendance/check-out', {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance-today'] });
      queryClient.invalidateQueries({ queryKey: ['attendance-records'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] });
    },
  });
  const punchError = checkOutMutation.error || checkInMutation.error;

  const startTimerMutation = useMutation({
    mutationFn: () => api.post('/timer/start', {}),
    onMutate: () => setTimerError(null),
    onError: setTimerError,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['timer-today'] }),
  });

  const pauseTimerMutation = useMutation({
    mutationFn: () => api.post('/timer/pause', {}),
    onMutate: () => setTimerError(null),
    onError: setTimerError,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['timer-today'] }),
  });

  const resumeTimerMutation = useMutation({
    mutationFn: () => api.post('/timer/resume', {}),
    onMutate: () => setTimerError(null),
    onError: setTimerError,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['timer-today'] }),
  });

  const stopTimerMutation = useMutation({
    mutationFn: () => api.post('/timer/stop', {}),
    onMutate: () => setTimerError(null),
    onError: setTimerError,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timer-today'] });
      queryClient.invalidateQueries({ queryKey: ['attendance-today'] });
      queryClient.invalidateQueries({ queryKey: ['attendance-records'] });
    },
  });

  const timerActions = [startTimerMutation, pauseTimerMutation, resumeTimerMutation, stopTimerMutation];
  const timerBusy = timerActions.some((action) => action.isPending);

  const formatSeconds = (sec: number) => {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const recordsByDate = new Map<string, any[]>();
  for (const record of recordsList) {
    const key = record.date.slice(0, 10);
    const existing = recordsByDate.get(key);
    if (existing) existing.push(record);
    else recordsByDate.set(key, [record]);
  }
  const reportRecords = recordsList.filter((record) => {
    const key = record.date.slice(0, 10);
    return key >= reportStart && key <= reportEnd;
  });
  const totals = countAttendance(reportRecords);
  const hasReport = reportCategories.some(({ key }) => totals[key] > 0);
  const trendChartData = [];
  for (let day = Date.parse(reportStart); day <= Date.parse(reportEnd); day += dayMs) {
    const key = dateKey(new Date(day));
    trendChartData.push({ day: key.slice(5), ...countAttendance(recordsByDate.get(key) ?? []) });
  }
  const reportLabel = reportStart === reportEnd ? reportStart : reportStart + ' – ' + reportEnd;
  const reportReady = Boolean(attendanceDate && recordsQuery.isSuccess);

  // Monthly Calendar computation
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const calendarCells: Array<{ day: number | null; dateStr: string | null }> = [];
  for (let i = 0; i < firstDayOfWeek; i++) {
    calendarCells.push({ day: null, dateStr: null });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    calendarCells.push({ day: d, dateStr });
  }

  return (
    <div className="space-y-6">
      {user?.employee?.id && ['EMPLOYEE', 'HR_MANAGER', 'COMPANY_ADMIN'].includes(user.role) && <Link href={user.role === 'EMPLOYEE' ? '/dashboard/my-leave?regularize=1' : '/dashboard/leave?regularize=1'} className="inline-block text-sm font-semibold text-indigo-700 underline dark:text-indigo-300">Regularize absence</Link>}

      {actionFeedback && (
        <div
          role="alert"
          className={`flex items-center justify-between rounded-xl px-4 py-3 text-sm shadow-sm ${
            actionFeedback.type === 'success'
              ? 'border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200'
              : 'border border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200'
          }`}
        >
          <span>{actionFeedback.message}</span>
          <button
            type="button"
            onClick={() => setActionFeedback(null)}
            className="ml-3 text-xs font-semibold underline hover:opacity-80"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Attendance & Work Timer
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Log daily punches, view Present vs. Absent analytics graphs, and inspect the monthly attendance calendar.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="#remote-work-requests"
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500"
          >
            <Home className="h-3.5 w-3.5" /> Remote Work Requests
          </a>
          {isHrOrAdmin && (
            <Link
              href="/dashboard/attendance/exceptions"
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
            >
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> Exceptions Queue
            </Link>
          )}
          <Link
            href="/dashboard/attendance/history"
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
          >
            <History className="h-3.5 w-3.5" /> History Log
          </Link>
        </div>
      </div>

      <ContextualHelpTip
        id="attendance-guide"
        userId={user?.id}
        title="Attendance & Shift Guide"
        description="Check in onsite from an authorized IP or submit a Remote Work Request before working remotely. Check out at shift end to finalize working hours and classification. Need to fix a missed past day? Use Regularize absence in the Monthly Calendar."
      />

      <section aria-label="Attendance reporting">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <label htmlFor="attendance-period" className="text-sm font-semibold">Reporting period</label>
          <select id="attendance-period" value={period}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            onChange={(event) => {
              setPeriod(event.target.value as ReportingPeriod);
              setCalendarMonth(null);
              setSelectedDateStr(null);
            }}>
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            {period === 'historical' && <option value="historical" disabled>Selected Month</option>}
          </select>
          {attendanceDate && <span className="text-sm text-zinc-500 dark:text-zinc-400">{reportLabel}</span>}
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          {reportCategories.map(({ key, name }) => (
            <div key={key} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">{name}</span>
              <p className="mt-1 text-2xl font-extrabold">{reportReady ? totals[key] : '—'}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Main Grid: Punch Card + Work Timer */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Attendance Punch Card */}
        {hasEmployeeContext ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <Clock className="h-5 w-5 text-indigo-600" /> Daily Punch
            </h2>
            {attendance?.status && <StatusBadge status={attendance.status} />}
          </div>
          {overnightShiftDate && (
            <p className="mt-2 text-xs text-zinc-500">Shift date {overnightShiftDate}</p>
          )}
          {punchError && (
            <p role="alert" className="mt-3 text-sm text-rose-700 dark:text-rose-300">{punchError.message}</p>
          )}

          <div className="mt-6 rounded-xl border border-zinc-100 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-800/40">
            <div className="grid grid-cols-2 gap-4 text-center">
              <div>
                <p className="text-xs text-zinc-500">Check In</p>
                <p className="mt-1 text-base font-bold text-zinc-900 dark:text-zinc-100">
                  {attendance?.checkInTime
                    ? new Date(attendance.checkInTime).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '—:—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Check Out</p>
                <p className="mt-1 text-base font-bold text-zinc-900 dark:text-zinc-100">
                  {attendance?.checkOutTime
                    ? new Date(attendance.checkOutTime).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '—:—'}
                </p>
              </div>
            </div>
          </div>

          {attendance?.shift && (
            <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 dark:border-indigo-900/40 dark:bg-indigo-950/30">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-indigo-900 dark:text-indigo-200">
                  Shift: {attendance.shift.name || 'Standard Shift'}
                </span>
                {attendance.timezone && (
                  <span className="rounded bg-white/80 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">
                    {attendance.timezone}
                  </span>
                )}
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-zinc-600 dark:text-zinc-300">
                <div>
                  <span className="block text-[10px] text-zinc-400">Hours</span>
                  <strong className="font-semibold text-zinc-800 dark:text-zinc-100">
                    {formatShiftTime(attendance.shift.startTime)} – {formatShiftTime(attendance.shift.endTime)}
                  </strong>
                </div>
                <div>
                  <span className="block text-[10px] text-zinc-400">Break</span>
                  <strong className="font-semibold text-zinc-800 dark:text-zinc-100">
                    {attendance.shift.breakDuration ?? 0} mins
                  </strong>
                </div>
                <div>
                  <span className="block text-[10px] text-zinc-400">Work Days</span>
                  <strong className="font-semibold text-zinc-800 dark:text-zinc-100">
                    {formatWorkDays(attendance.shift.workDays)}
                  </strong>
                </div>
              </div>
            </div>
          )}

          {attendanceQuery.isError ? (
            <div className="mt-4 text-sm text-rose-700 dark:text-rose-300">
              <p role="alert">Today&apos;s attendance couldn&apos;t load.</p>
              <button type="button" className="mt-2 font-semibold underline" onClick={() => void attendanceQuery.refetch()} disabled={attendanceQuery.isFetching}>Retry attendance</button>
            </div>
          ) : attendanceQuery.isPending ? (
            <p role="status" className="mt-4 text-sm text-zinc-500">Loading today&apos;s attendance…</p>
          ) : !attendance?.checkInTime ? (
            <div className="mt-6 space-y-4">
              {/* Onsite / Remote Toggle */}
              <div className="flex rounded-lg border border-zinc-200 p-1 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsRemote(false)}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-xs font-semibold ${
                    !isRemote
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400'
                  }`}
                >
                  <MapPin className="h-3.5 w-3.5" /> Onsite Punch
                </button>
                <button
                  type="button"
                  onClick={() => setIsRemote(true)}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-xs font-semibold ${
                    isRemote
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400'
                  }`}
                >
                  <Laptop className="h-3.5 w-3.5" /> Remote Punch
                </button>
              </div>

              {isRemote && (
                <p
                  className={`text-xs p-2.5 rounded-lg border ${
                    whitelistData?.isCurrentIpWhitelisted
                      ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900'
                      : 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900'
                  }`}
                >
                  {whitelistData?.isCurrentIpWhitelisted
                    ? `✅ Your IP (${whitelistData.currentClientIp}) is whitelisted by HR for Remote/Hybrid work — your remote check-in will be immediately approved.`
                    : '⚠️ Remote check-ins from non-whitelisted IPs without an approved standing permission are routed to the HR Exceptions Queue.'}
                </p>
              )}

              {/* Detected Network IP & Coordinates Banner */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-400">
                <span className="flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5 text-indigo-600" />
                  IP:{' '}
                  <strong className="font-mono text-zinc-900 dark:text-zinc-100">
                    {whitelistData?.currentClientIp ?? 'Unavailable'}
                  </strong>
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-emerald-600" />
                  Approximate IP Lat/Long:{' '}
                  <strong className="font-mono text-zinc-900 dark:text-zinc-100">
                    {typeof currentLatitude === 'number' && typeof currentLongitude === 'number'
                      ? `${currentLatitude}, ${currentLongitude}`
                      : 'Unavailable'}
                  </strong>
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    whitelistData?.isCurrentIpWhitelisted
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                      : 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                  }`}
                >
                  {whitelistData?.isCurrentIpWhitelisted
                    ? 'HR Whitelisted IP'
                    : whitelistData?.currentClientIp ? 'Standard IP' : 'IP unavailable'}
                </span>
              </div>

              <input
                type="text"
                maxLength={255}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes or remarks..."
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-800"
              />

              <button
                disabled={checkInMutation.isPending}
                onClick={() => checkInMutation.mutate()}
                className="w-full rounded-lg bg-emerald-600 py-3 text-sm font-semibold text-white shadow hover:bg-emerald-500 disabled:opacity-50"
              >
                {checkInMutation.isPending ? 'Punching In...' : 'Punch In Now'}
              </button>
            </div>
          ) : attendance?.status === 'MISSING_CHECKOUT' ? (
            <p className="mt-4 text-sm text-amber-700 dark:text-amber-300">Missing checkout. Your attendance is awaiting review.</p>
          ) : !attendance?.checkOutTime && !attendance?.finalizedAt ? (
            <div className="mt-6 space-y-4">
              <p className="text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 p-2.5 rounded-lg border border-emerald-200 dark:border-emerald-900 flex items-center gap-1.5">
                <CheckCircle className="h-4 w-4" />
                {overnightShiftDate ? 'You are still checked in for this shift.' : 'You are currently checked in today.'}
              </p>
              <button
                disabled={checkOutMutation.isPending}
                onClick={() => checkOutMutation.mutate()}
                className="w-full rounded-lg bg-rose-600 py-3 text-sm font-semibold text-white shadow hover:bg-rose-500 disabled:opacity-50"
              >
                {checkOutMutation.isPending ? 'Punching Out...' : 'Punch Out & Conclude Shift'}
              </button>
            </div>
          ) : (
            <div className="mt-6 rounded-lg bg-zinc-50 p-4 text-center text-xs text-zinc-500 dark:bg-zinc-800/40">
              {overnightShiftDate ? 'Shift completed.' : 'Shift completed for today.'}{' '}
              Total work: {formatWorkDuration(attendance)} (Overtime:{' '}
              {attendance.overtimeMinutes || 0}m).
            </div>
          )}
        </div>
        ) : (
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <Clock className="h-5 w-5 text-indigo-600" /> Daily Punch
            </h2>
            <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
              Personal check-in and check-out are available to users with an employee profile. You can still review this organization&apos;s attendance records below.
            </p>
          </div>
        )}

        {/* Work Timer (Premium) */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <Laptop className="h-5 w-5 text-indigo-600" /> Work Timer (Premium)
            </h2>
            <span className="rounded bg-indigo-50 px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
              Premium
            </span>
          </div>

          <div className="my-8 text-center">
            <span className="font-mono text-5xl font-black tracking-tight text-zinc-900 dark:text-zinc-100">
              {formatSeconds(timerSeconds)}
            </span>
            <p className="mt-2 text-xs text-zinc-500 uppercase tracking-widest">
              Status:{' '}
              <span className="font-bold text-zinc-800 dark:text-zinc-200">
                {timer?.status || 'IDLE'}
              </span>
            </p>
          </div>

          {timerError && (
            <p role="alert" className="mb-4 text-center text-sm text-rose-700 dark:text-rose-300">{timerError.message}</p>
          )}
          <div className="flex items-center justify-center gap-3">
            {!canUseTimer ? (
              <p className="text-center text-sm text-zinc-500">{hasEmployeeContext ? 'Work Timer is available on ZenHR Premium.' : 'Work Timer is available to users with an employee profile.'}</p>
            ) : timerQuery.isError ? (
              <div className="text-center text-sm text-rose-700 dark:text-rose-300">
                <p role="alert">The work timer couldn&apos;t load.</p>
                <button type="button" className="mt-2 font-semibold underline" onClick={() => void timerQuery.refetch()} disabled={timerQuery.isFetching}>Retry work timer</button>
              </div>
            ) : timerQuery.isPending ? (
              <p role="status" className="text-sm text-zinc-500">Loading work timer…</p>
            ) : !timer || timer.status === 'STOPPED' ? (
              <button
                disabled={timerBusy}
                onClick={() => startTimerMutation.mutate()}
                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-2.5 text-xs font-semibold text-white shadow hover:bg-indigo-500"
              >
                <Play className="h-4 w-4" /> Start Timer
              </button>
            ) : timer.status === 'RUNNING' ? (
              <>
                <button
                  disabled={timerBusy}
                  onClick={() => pauseTimerMutation.mutate()}
                  className="flex items-center gap-2 rounded-lg bg-amber-500 px-5 py-2.5 text-xs font-semibold text-white shadow hover:bg-amber-400"
                >
                  <Pause className="h-4 w-4" /> Pause Break
                </button>
                <button
                  disabled={timerBusy}
                  onClick={() => stopTimerMutation.mutate()}
                  className="flex items-center gap-2 rounded-lg bg-rose-600 px-5 py-2.5 text-xs font-semibold text-white shadow hover:bg-rose-500"
                >
                  <Square className="h-4 w-4" /> Stop & Finalize
                </button>
              </>
            ) : (
              <>
                <button
                  disabled={timerBusy}
                  onClick={() => resumeTimerMutation.mutate()}
                  className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white shadow hover:bg-emerald-500"
                >
                  <Play className="h-4 w-4" /> Resume Work
                </button>
                <button
                  disabled={timerBusy}
                  onClick={() => stopTimerMutation.mutate()}
                  className="flex items-center gap-2 rounded-lg bg-rose-600 px-5 py-2.5 text-xs font-semibold text-white shadow hover:bg-rose-500"
                >
                  <Square className="h-4 w-4" /> Stop & Finalize
                </button>
              </>
            )}
          </div>

          <p className="mt-6 text-center text-xs text-zinc-400">
            Breaks exceeding 60 minutes automatically broadcast real-time alerts to your Team Lead,
            Department Manager, and CEO.
          </p>
        </div>
      </div>

      {/* Attendance Analytics Graph (Present vs Remote vs Absent) & Monthly Calendar */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Attendance Graph: Present vs Remote vs Absent */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-indigo-600" />
                Attendance Analytics
              </h2>
              <p className="text-xs text-zinc-500">
                {attendanceDate ? reportLabel : 'Company attendance dates'}
              </p>
            </div>
          </div>

          {reportReady && hasReport ? <div className="h-72 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendChartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip
                  cursor={CHART_TOOLTIP_CURSOR}
                  content={<ChartTooltipContent />}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                {reportCategories.map(({ key, color, name }) => (
                  <Bar key={key} dataKey={key} stackId="attendance" fill={color} name={name} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div> : <p role="status" className="py-8 text-sm text-zinc-500">
            {overviewQuery.isError || recordsQuery.isError ? 'Unable to load attendance reporting.'
              : reportReady ? 'No reportable attendance in this period.' : 'Loading attendance reporting…'}
          </p>}
        </div>

        {/* Interactive Monthly Attendance Calendar */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Calendar className="h-5 w-5 text-indigo-600" />
                Monthly Attendance Calendar
              </h2>
              <p className="text-xs text-zinc-500">
                Daily attendance status and check-in coverage across the month.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Previous month"
                onClick={() => {
                  setCalendarMonth(new Date(year, month - 1, 1));
                  setPeriod('historical');
                  setSelectedDateStr(null);
                }}
                className="rounded-lg border border-zinc-200 p-1.5 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 min-w-[110px] text-center">
                {calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </span>
              <button
                type="button"
                aria-label="Next month"
                onClick={() => {
                  setCalendarMonth(new Date(year, month + 1, 1));
                  setPeriod('historical');
                  setSelectedDateStr(null);
                }}
                className="rounded-lg border border-zinc-200 p-1.5 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Weekday Headers */}
          <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] font-bold uppercase text-zinc-400 mb-2">
            <div>Sun</div>
            <div>Mon</div>
            <div>Tue</div>
            <div>Wed</div>
            <div>Thu</div>
            <div>Fri</div>
            <div>Sat</div>
          </div>

          {/* Calendar Days Grid */}
          <div className="grid grid-cols-7 gap-1.5">
            {calendarCells.map((cell, idx) => {
              if (!cell.day || !cell.dateStr) {
                return <div key={`empty-${idx}`} className="h-14 rounded-lg bg-zinc-50/40 dark:bg-zinc-950/20" />;
              }

              const dayRecords = recordsList.filter((r) => {
                if (!r.date) return false;
                return new Date(r.date).toISOString().slice(0, 10) === cell.dateStr;
              });

              const dayOfWeek = new Date(year, month, cell.day).getDay();
              const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
              const isToday = attendanceDate === cell.dateStr;
              const isSelected = selectedDateStr === cell.dateStr;

              const { present: dayPresentOnsite, remote: dayRemote, absent: dayAbsent,
                exceptions: dayReview, halfDay: dayHalf, leave: dayOnLeave } = countAttendance(dayRecords);
              const dayPresent = dayPresentOnsite + dayRemote;
              const dayInProgress = dayRecords.filter((r) => r.status === 'IN_PROGRESS').length;
              const singleStatus = dayPresentOnsite === 0 && dayRemote > 0 ? 'PRESENT_REMOTE' : dayRecords[0]?.status;

              let cellBadge = null;
              if (dayRecords.length > 1) {
                const mobileDots = [
                  dayPresent > 0 ? { key: 'P', color: 'bg-emerald-500', label: `${dayPresent} Present` } : null,
                  dayHalf > 0 ? { key: 'H', color: 'bg-violet-500', label: `${dayHalf} Half day` } : null,
                  dayAbsent > 0 ? { key: 'A', color: 'bg-rose-500', label: `${dayAbsent} Absent` } : null,
                  dayReview > 0 ? { key: 'R', color: 'bg-amber-500', label: `${dayReview} Exceptions` } : null,
                  dayOnLeave > 0 ? { key: 'L', color: 'bg-indigo-500', label: `${dayOnLeave} On Leave` } : null,
                  dayInProgress > 0 ? { key: 'I', color: 'bg-sky-500', label: `${dayInProgress} In Progress` } : null,
                ].filter(Boolean) as { key: string; color: string; label: string }[];

                cellBadge = (
                  <>
                    <div
                      className="mt-1 flex items-center gap-1 sm:hidden"
                      aria-label={mobileDots.map((d) => d.label).join(', ')}
                    >
                      {mobileDots.slice(0, 4).map((d) => (
                        <span key={d.key} className={`h-1.5 w-1.5 shrink-0 rounded-full ${d.color}`} />
                      ))}
                    </div>
                    <div className="mt-1 hidden flex-wrap gap-0.5 text-[9px] font-semibold sm:flex">
                      {dayPresent > 0 && (
                        <span title="Present" className="rounded bg-emerald-100 px-1 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                          {dayPresent} P
                        </span>
                      )}
                      {dayHalf > 0 && (
                        <span title="Half day" className="rounded bg-violet-100 px-1 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                          {dayHalf} H
                        </span>
                      )}
                      {dayAbsent > 0 && (
                        <span title="Absent" className="rounded bg-rose-100 px-1 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                          {dayAbsent} A
                        </span>
                      )}
                      {dayReview > 0 && (
                        <span title="Exceptions / Pending review" className="rounded bg-amber-100 px-1 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                          {dayReview} R
                        </span>
                      )}
                      {dayOnLeave > 0 && (
                        <span title="On Leave" className="rounded bg-indigo-100 px-1 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                          {dayOnLeave} L
                        </span>
                      )}
                      {dayInProgress > 0 && (
                        <span title="In Progress" className="rounded bg-sky-100 px-1 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
                          {dayInProgress} I
                        </span>
                      )}
                    </div>
                  </>
                );
              } else if (singleStatus) {
                const dotColor =
                  singleStatus === 'PRESENT' || singleStatus === 'PRESENT_REMOTE'
                    ? 'bg-emerald-500'
                    : singleStatus === 'ABSENT'
                      ? 'bg-rose-500'
                      : singleStatus === 'HALF_DAY'
                        ? 'bg-violet-500'
                        : singleStatus === 'ON_LEAVE'
                          ? 'bg-indigo-500'
                          : 'bg-amber-500';
                const color =
                  singleStatus === 'PRESENT' || singleStatus === 'PRESENT_REMOTE'
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                    : singleStatus === 'ABSENT'
                      ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                      : singleStatus === 'HALF_DAY'
                        ? 'bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300'
                        : singleStatus === 'ON_LEAVE'
                          ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300';
                cellBadge = (
                  <>
                    <span className={`mt-1 inline-block h-1.5 w-1.5 rounded-full sm:hidden ${dotColor}`} />
                    <span className={`mt-1 hidden truncate rounded px-1 py-0.5 text-[9px] font-bold sm:inline-block ${color}`}>
                      {calendarStatus[singleStatus] ?? singleStatus}
                    </span>
                  </>
                );
              } else if (isWeekend) {
                cellBadge = (
                  <span className="mt-1 inline-block text-[9px] text-zinc-400">Off</span>
                );
              }

              return (
                <button
                  key={cell.dateStr}
                  type="button"
                  onClick={() =>
                    setSelectedDateStr((prev) => (prev === cell.dateStr ? null : cell.dateStr!))
                  }
                  aria-current={isToday ? 'date' : undefined}
                  aria-pressed={isSelected}
                  aria-label={`Attendance for ${cell.dateStr}`}
                  className={`min-h-14 sm:min-h-[4.25rem] overflow-hidden rounded-lg border p-1.5 flex flex-col justify-between text-left text-xs transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                    isSelected
                      ? 'border-indigo-600 bg-indigo-50/60 ring-2 ring-indigo-500 dark:bg-indigo-950/50'
                      : isToday
                        ? 'border-indigo-500 bg-indigo-50/30 dark:bg-indigo-950/30 ring-1 ring-indigo-500'
                        : 'border-zinc-100 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700'
                  }`}
                >
                  <span
                    className={`text-[11px] font-bold leading-none ${
                      isToday || isSelected
                        ? 'text-indigo-600 dark:text-indigo-400'
                        : isWeekend
                          ? 'text-zinc-400'
                          : 'text-zinc-700 dark:text-zinc-300'
                    }`}
                  >
                    {cell.day}
                  </span>
                  {cellBadge}
                </button>
              );
            })}
          </div>

          {/* Calendar Status Legend */}
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-zinc-100 pt-3 text-[11px] text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
              Present (P)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-violet-500" aria-hidden="true" />
              Half Day (H)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-rose-500" aria-hidden="true" />
              Absent (A)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
              Exception / Review (R)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-indigo-500" aria-hidden="true" />
              On Leave (L)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-sky-500" aria-hidden="true" />
              In Progress (I)
            </span>
          </div>

          {/* Selected-Day Breakdown Panel */}
          {selectedDateStr && (() => {
            const selectedRecords = recordsList.filter((r) => {
              const rDate = new Date(r.date).toISOString().slice(0, 10);
              return rDate === selectedDateStr;
            });
            const presentOnsiteCount = selectedRecords.filter((r) => r.status === 'PRESENT' && !r.isRemote).length;
            const presentRemoteCount = selectedRecords.filter(
              (r) => r.status === 'PRESENT_REMOTE' || (r.status === 'PRESENT' && r.isRemote),
            ).length;
            const halfDayCount = selectedRecords.filter((r) => r.status === 'HALF_DAY').length;
            const absentCount = selectedRecords.filter((r) => r.status === 'ABSENT').length;
            const onLeaveCount = selectedRecords.filter((r) => r.status === 'ON_LEAVE').length;
            const inProgressCount = selectedRecords.filter((r) => r.status === 'IN_PROGRESS').length;
            const exceptionCount = selectedRecords.filter((r) =>
              ['ABSENT_PENDING_REVIEW', 'MISSING_CHECKOUT'].includes(r.status),
            ).length;

            const summaryTiles = [
              { label: 'Present (Onsite)', count: presentOnsiteCount, tone: 'text-emerald-600 dark:text-emerald-400' },
              { label: 'Remote', count: presentRemoteCount, tone: 'text-blue-600 dark:text-blue-400' },
              { label: 'Half Day', count: halfDayCount, tone: 'text-violet-600 dark:text-violet-400' },
              { label: 'Absent', count: absentCount, tone: 'text-rose-600 dark:text-rose-400' },
              { label: 'On Leave', count: onLeaveCount, tone: 'text-indigo-600 dark:text-indigo-400' },
              { label: 'In Progress', count: inProgressCount, tone: 'text-sky-600 dark:text-sky-400' },
              { label: 'Exceptions', count: exceptionCount, tone: 'text-amber-600 dark:text-amber-400' },
            ];

            return (
              <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/50">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-200">
                      Breakdown for{' '}
                      {new Date(`${selectedDateStr}T12:00:00`).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </h3>
                    <p className="text-[11px] text-zinc-500">
                      {selectedRecords.length} authorized record{selectedRecords.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedDateStr(null)}
                    className="text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
                  >
                    Clear
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {summaryTiles.map((tile) => (
                    <div
                      key={tile.label}
                      className="rounded-lg border border-zinc-200 bg-white px-2.5 py-2 dark:border-zinc-800 dark:bg-zinc-900"
                    >
                      <p className="text-[10px] font-medium text-zinc-500">{tile.label}</p>
                      <p className={`text-sm font-bold ${tile.tone}`}>{tile.count}</p>
                    </div>
                  ))}
                </div>

                {selectedRecords.length === 0 ? (
                  <p className="mt-3 text-xs text-zinc-500">
                    No attendance records recorded for this date.
                  </p>
                ) : (
                  <div className="mt-3 max-h-48 space-y-1.5 overflow-y-auto pr-1">
                    {selectedRecords.map((rec: any) => (
                      <div
                        key={rec.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-900"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-zinc-900 dark:text-zinc-100">
                            {rec.employee
                              ? `${rec.employee.firstName} ${rec.employee.lastName}`
                              : 'My Record'}
                          </p>
                          {rec.employee?.department?.name && (
                            <p className="truncate text-[11px] text-zinc-500">
                              {rec.employee.department.name}
                            </p>
                          )}
                        </div>
                        <StatusBadge
                          status={
                            rec.status === 'PRESENT' && rec.isRemote
                              ? 'PRESENT_REMOTE'
                              : rec.status
                          }
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>

      {/* HR IP Whitelist Management for Office & Remote/Hybrid (WFH) Employees */}
      {isHrOrAdmin && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-indigo-600" />
                HR IP Whitelist (Office & Remote / Hybrid WFH Access Control)
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Whitelist Office gateways and Remote/Hybrid employee IP addresses so authorized WFH staff bypass office IP restrictions automatically.
              </p>
            </div>
            {whitelistData?.currentClientIp && !whitelistData?.isCurrentIpWhitelisted && (
              <button
                type="button"
                onClick={() =>
                  addWhitelistMutation.mutate({
                    ipAddress: whitelistData.currentClientIp,
                    description: 'Authorized Office / HR Admin Network IP',
                  })
                }
                disabled={addWhitelistMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                Whitelist My Current IP ({whitelistData.currentClientIp})
              </button>
            )}
          </div>

          {/* Add IP Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newWhitelistIp.trim()) return;
              addWhitelistMutation.mutate({
                ipAddress: newWhitelistIp.trim(),
                description:
                  newWhitelistDesc.trim() || 'Remote / Hybrid Employee Whitelisted IP',
              });
            }}
            className="grid grid-cols-1 gap-3 sm:grid-cols-3"
          >
            <input
              type="text"
              value={newWhitelistIp}
              onChange={(e) => setNewWhitelistIp(e.target.value)}
              placeholder="IP Address (e.g. 203.0.113.45 or 127.0.0.1)"
              className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-mono dark:border-zinc-700 dark:bg-zinc-800"
            />
            <input
              type="text"
              value={newWhitelistDesc}
              onChange={(e) => setNewWhitelistDesc(e.target.value)}
              placeholder="Label (e.g. Hybrid WFH - Evan Wright or HQ Office Router)"
              className="rounded-lg border border-zinc-300 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-800"
            />
            <button
              type="submit"
              disabled={!newWhitelistIp.trim() || addWhitelistMutation.isPending}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {addWhitelistMutation.isPending ? 'Adding...' : 'Add IP to Whitelist'}
            </button>
          </form>

          {/* Whitelisted IPs Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-800/60 text-zinc-500 uppercase">
                <tr>
                  <th className="py-2.5 px-3">Whitelisted IP Address</th>
                  <th className="py-2.5 px-3">Employee / Location Label</th>
                  <th className="py-2.5 px-3">Added On</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {isWhitelistLoading ? (
                  <tr>
                    <td colSpan={4} className="py-4 px-3 text-center text-zinc-400">
                      Loading IP whitelist...
                    </td>
                  </tr>
                ) : whitelistError || !Array.isArray(whitelistData?.items) ? (
                  <tr>
                    <td colSpan={4} className="py-4 px-3 text-center text-rose-600 dark:text-rose-400">
                      Could not load the IP whitelist.{' '}
                      <button type="button" onClick={() => void refetchWhitelist()} className="font-semibold underline">
                        Retry
                      </button>
                    </td>
                  </tr>
                ) : whitelistData.items.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-4 px-3 text-center text-zinc-400">
                      No IP restrictions configured yet. Add Office or Remote/Hybrid employee IPs above to enforce IP whitelisting.
                    </td>
                  </tr>
                ) : (
                  whitelistData.items.map((item: any) => (
                    <tr key={item.id}>
                      <td className="py-2.5 px-3 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                        {item.ipAddress}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-zinc-800 dark:text-zinc-200">
                        {item.description || 'Whitelisted Network'}
                      </td>
                      <td className="py-2.5 px-3 text-zinc-500">
                        {new Date(item.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => removeWhitelistMutation.mutate(item.id)}
                          disabled={removeWhitelistMutation.isPending}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Remove
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Remote Work (WFH) Permissions & Requests Card */}
      <div id="remote-work-requests" className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <Home className="h-5 w-5 text-indigo-600" />
              Remote Work (WFH) Requests & Approvals
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Submit and manage standing Work From Home permissions. Once approved, remote punches avoid unauthorized check-in exceptions.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              createRemoteMutation.reset();
              setShowRemoteModal(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500"
          >
            <Plus className="h-3.5 w-3.5" /> New Remote Work Request
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-50 dark:bg-zinc-800/60 text-zinc-500 uppercase">
              <tr>
                <th className="py-2.5 px-3">Employee</th>
                <th className="py-2.5 px-3">Date Range</th>
                <th className="py-2.5 px-3">Reason / Justification</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Workflow</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {remotePermissions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 px-3 text-center text-zinc-400">
                    No remote work permissions requested yet. Click &quot;New Remote Work Request&quot; above to submit one.
                  </td>
                </tr>
              ) : (
                remotePermissions.map((perm: any) => {
                  const isOwnRequest = perm.employee?.userId === user?.id;
                  const canStep1 =
                    !isOwnRequest &&
                    (user?.role === 'TEAM_LEAD' || isHrOrAdmin) &&
                    perm.status === 'PENDING' &&
                    !perm.step1ApprovedAt;
                  const canStep2 =
                    !isOwnRequest &&
                    (user?.role === 'DEPARTMENT_MANAGER' || isHrOrAdmin) &&
                    perm.status === 'PENDING' &&
                    perm.step1ApprovedAt;

                  return (
                    <tr key={perm.id}>
                      <td className="py-2.5 px-3 font-medium text-zinc-900 dark:text-zinc-100">
                        {perm.employee?.firstName} {perm.employee?.lastName}
                        <span className="block text-[11px] text-zinc-400">
                          {perm.employee?.employeeCode}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-zinc-700 dark:text-zinc-300">
                        {new Date(perm.startDate).toLocaleDateString(undefined, { timeZone: 'UTC' })} — {new Date(perm.endDate).toLocaleDateString(undefined, { timeZone: 'UTC' })}
                      </td>
                      <td className="py-2.5 px-3 text-zinc-600 dark:text-zinc-400 max-w-xs truncate">
                        {perm.reason}
                      </td>
                      <td className="py-2.5 px-3">
                        <StatusBadge status={perm.status} />
                      </td>
                      <td className="py-2.5 px-3 text-[11px]">
                        <div className="space-y-0.5">
                          <span className={perm.step1ApprovedAt ? 'text-emerald-600 font-medium' : 'text-zinc-400'}>
                            {perm.step1ApprovedAt ? '✓ Step 1 (TL Recommended)' : '○ Step 1 Pending'}
                          </span>
                          <span className="block" />
                          <span className={perm.step2ApprovedAt ? 'text-emerald-600 font-medium' : 'text-zinc-400'}>
                            {perm.step2ApprovedAt ? '✓ Step 2 (DM/HR Approved)' : '○ Step 2 Pending'}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {canStep1 && (
                          <button
                            type="button"
                            onClick={() => step1ApproveMutation.mutate(perm.id)}
                            disabled={step1ApproveMutation.isPending}
                            className="mr-1.5 inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300"
                          >
                            Recommend (Step 1)
                          </button>
                        )}
                        {canStep2 && (
                          <button
                            type="button"
                            onClick={() => step2ApproveMutation.mutate(perm.id)}
                            disabled={step2ApproveMutation.isPending}
                            className="inline-flex items-center gap-1 rounded bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-500"
                          >
                            Approve (Step 2)
                          </button>
                        )}
                        {!canStep1 && !canStep2 && (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Remote Work Request Modal */}
      {showRemoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-labelledby="remote-request-title" className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between pb-4 border-b border-zinc-200 dark:border-zinc-800">
              <h3 id="remote-request-title" className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Home className="h-5 w-5 text-indigo-600" /> Request Remote Work (WFH)
              </h3>
              <button
                type="button"
                aria-label="Close remote work request"
                onClick={() => setShowRemoteModal(false)}
                disabled={createRemoteMutation.isPending}
                className="text-zinc-400 hover:text-zinc-600 text-lg leading-none"
              >
                &times;
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!remoteStartDate || !remoteEndDate || !remoteReason.trim()) return;
                createRemoteMutation.mutate();
              }}
              className="mt-4 space-y-4"
            >
              <div>
                <label htmlFor="remote-request-start" className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Start Date *
                </label>
                <input
                  id="remote-request-start"
                  type="date"
                  required
                  value={remoteStartDate}
                  onChange={(e) => setRemoteStartDate(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-800"
                />
              </div>

              <div>
                <label htmlFor="remote-request-end" className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  End Date *
                </label>
                <input
                  id="remote-request-end"
                  type="date"
                  required
                  min={remoteStartDate || undefined}
                  value={remoteEndDate}
                  onChange={(e) => setRemoteEndDate(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-800"
                />
              </div>

              <div>
                <label htmlFor="remote-request-reason" className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Reason / Justification *
                </label>
                <textarea
                  id="remote-request-reason"
                  required
                  maxLength={500}
                  rows={3}
                  value={remoteReason}
                  onChange={(e) => setRemoteReason(e.target.value)}
                  placeholder="e.g. Relocating temporarily, home renovation, or health precaution..."
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-800"
                />
              </div>

              {createRemoteMutation.isError && (
                <p role="alert" className="text-xs text-rose-700 dark:text-rose-300">
                  {createRemoteMutation.error instanceof ApiError && createRemoteMutation.error.status < 500
                    ? createRemoteMutation.error.message
                    : 'We couldn’t confirm the request. Close this window and check the request list before trying again.'}
                </p>
              )}
              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowRemoteModal(false)}
                  disabled={createRemoteMutation.isPending}
                  className="rounded-lg border border-zinc-300 px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createRemoteMutation.isPending || !remoteStartDate || !remoteEndDate || !remoteReason.trim()}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {createRemoteMutation.isPending ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
