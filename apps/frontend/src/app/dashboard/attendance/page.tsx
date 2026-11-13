'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { formatWorkDuration } from '@/lib/attendance-duration';
import { useAuth, type UserProfile } from '@/lib/auth-context';
import { StatusBadge } from '@/components/ui/status-badge';
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

const calendarStatus: Record<string, string> = {
  PRESENT: 'Present',
  PRESENT_REMOTE: 'Remote',
  ABSENT: 'Absent',
  ABSENT_PENDING_REVIEW: 'Review',
  ON_LEAVE: 'Leave',
  HOLIDAY: 'Holiday',
  WEEKEND: 'Off',
};

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
  const isHrOrAdmin =
    user?.role === 'SUPER_ADMIN' ||
    user?.role === 'COMPANY_ADMIN' ||
    user?.role === 'HR_MANAGER';
  const [isRemote, setIsRemote] = useState(false);
  const [notes, setNotes] = useState('');
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [newWhitelistIp, setNewWhitelistIp] = useState('');
  const [newWhitelistDesc, setNewWhitelistDesc] = useState('');
  const [showRemoteModal, setShowRemoteModal] = useState(false);
  const [remoteStartDate, setRemoteStartDate] = useState('');
  const [remoteEndDate, setRemoteEndDate] = useState('');
  const [remoteReason, setRemoteReason] = useState('');
  const [selectedMonth, setCalendarMonth] = useState<Date | null>(null);

  // Fetch today's attendance
  const { data: attendanceData } = useQuery({
    queryKey: ['attendance-today'],
    queryFn: () => api.get<any>('/attendance/today'),
    refetchInterval: 60_000,
  });

  // Fetch today's work timer
  const { data: timerData } = useQuery({
    queryKey: ['timer-today'],
    queryFn: () => api.get<any>('/timer/today'),
    refetchInterval: 60_000,
  });

  // Fetch attendance records for calendar & graph
  const { data: recordsData } = useQuery({
    queryKey: ['attendance-records'],
    queryFn: () => api.get<any>('/attendance/records'),
  });

  // Fetch dashboard overview for 7-day trend & headcount
  const { data: overviewData } = useQuery({
    queryKey: ['dashboard-overview'],
    queryFn: () => api.get<any>('/analytics/overview'),
    refetchInterval: 60_000,
  });

  // Fetch IP Whitelist & current client IP telemetry
  const { data: whitelistData } = useQuery({
    queryKey: ['attendance-ip-whitelist'],
    queryFn: () => api.get<any>('/attendance/ip-whitelist'),
  });

  // Fetch remote work permissions
  const { data: remotePermissions = [] } = useQuery({
    queryKey: ['remote-permissions'],
    queryFn: () => api.get<any[]>('/attendance/remote-permissions'),
  });

  const attendance = attendanceData;
  const attendanceDate = overviewData?.attendanceDate ?? attendance?.date?.slice(0, 10);
  const shiftDate = attendance?.date?.slice(0, 10);
  const overnightShiftDate = shiftDate && attendanceDate && shiftDate !== attendanceDate ? shiftDate : null;
  const calendarMonth = selectedMonth ?? (attendanceDate
    ? new Date(`${attendanceDate}T12:00:00`)
    : new Date());
  const timer = timerData;
  const currentLatitude = whitelistData?.currentGeo?.latitude;
  const currentLongitude = whitelistData?.currentGeo?.longitude;
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
      alert('Remote work request submitted successfully.');
    },
  });

  const step1ApproveMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/attendance/remote-permissions/${id}/step1`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remote-permissions'] });
      alert('Step 1 recommendation recorded.');
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        void queryClient.invalidateQueries({ queryKey: ['remote-permissions'] });
      }
      alert(err.message || 'Failed to approve Step 1.');
    },
  });

  const step2ApproveMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/attendance/remote-permissions/${id}/step2`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remote-permissions'] });
      alert('Step 2 approval granted.');
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        void queryClient.invalidateQueries({ queryKey: ['remote-permissions'] });
      }
      alert(err.message || 'Failed to approve Step 2.');
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
  const punchError = checkInMutation.error || checkOutMutation.error;

  const startTimerMutation = useMutation({
    mutationFn: () => api.post('/timer/start', {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['timer-today'] }),
  });

  const pauseTimerMutation = useMutation({
    mutationFn: () => api.post('/timer/pause', {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['timer-today'] }),
  });

  const resumeTimerMutation = useMutation({
    mutationFn: () => api.post('/timer/resume', {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['timer-today'] }),
  });

  const stopTimerMutation = useMutation({
    mutationFn: () => api.post('/timer/stop', {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timer-today'] });
      queryClient.invalidateQueries({ queryKey: ['attendance-today'] });
      queryClient.invalidateQueries({ queryKey: ['attendance-records'] });
    },
  });

  const formatSeconds = (sec: number) => {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const { present: presentCount, remote: remoteCount, absent: absentCount, exceptions: exceptionCount } =
    overviewData?.todaySummary ?? { present: 0, remote: 0, absent: 0, exceptions: 0 };

  const statusBreakdownChart = [
    {
      category: 'Present (Onsite)',
      Present: presentCount,
      Remote: 0,
      Absent: 0,
      Exceptions: 0,
    },
    {
      category: 'Present (Remote)',
      Present: 0,
      Remote: remoteCount,
      Absent: 0,
      Exceptions: 0,
    },
    {
      category: 'Absent',
      Present: 0,
      Remote: 0,
      Absent: absentCount,
      Exceptions: 0,
    },
    {
      category: 'Exceptions / Late',
      Present: 0,
      Remote: 0,
      Absent: 0,
      Exceptions: exceptionCount,
    },
  ];

  const trendChartData =
    overviewData?.attendanceTrend && overviewData.attendanceTrend.length > 0
      ? overviewData.attendanceTrend
      : statusBreakdownChart.map((item) => ({
          day: item.category,
          present: item.Present,
          remote: item.Remote,
          absent: item.Absent + item.Exceptions,
        }));

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

      {/* Attendance KPI Summary Cards (Present vs Remote vs Exceptions vs Absent) */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <span className="text-[11px] font-semibold uppercase text-zinc-500">Present (Onsite)</span>
          <p className="mt-1 text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
            {presentCount}
          </p>
          <span className="text-[11px] text-zinc-400">Verified onsite check-ins</span>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <span className="text-[11px] font-semibold uppercase text-zinc-500">Present (Remote)</span>
          <p className="mt-1 text-2xl font-extrabold text-blue-600 dark:text-blue-400">
            {remoteCount}
          </p>
          <span className="text-[11px] text-zinc-400">Authorized remote sessions</span>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <span className="text-[11px] font-semibold uppercase text-zinc-500">Absent Count</span>
          <p className="mt-1 text-2xl font-extrabold text-rose-600 dark:text-rose-400">
            {absentCount}
          </p>
          <span className="text-[11px] text-zinc-400">Unexcused / no check-in</span>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <span className="text-[11px] font-semibold uppercase text-zinc-500">Exceptions / Pending</span>
          <p className="mt-1 text-2xl font-extrabold text-amber-600 dark:text-amber-400">
            {exceptionCount}
          </p>
          <span className="text-[11px] text-zinc-400">Awaiting HR review</span>
        </div>
      </div>

      {/* Main Grid: Punch Card + Work Timer */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Attendance Punch Card */}
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

          {!attendance?.checkInTime ? (
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
          ) : !attendance?.checkOutTime ? (
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

          {/* Controls */}
          <div className="flex items-center justify-center gap-3">
            {!timer || timer.status === 'STOPPED' ? (
              <button
                disabled={startTimerMutation.isPending}
                onClick={() => startTimerMutation.mutate()}
                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-2.5 text-xs font-semibold text-white shadow hover:bg-indigo-500"
              >
                <Play className="h-4 w-4" /> Start Timer
              </button>
            ) : timer.status === 'RUNNING' ? (
              <>
                <button
                  disabled={pauseTimerMutation.isPending}
                  onClick={() => pauseTimerMutation.mutate()}
                  className="flex items-center gap-2 rounded-lg bg-amber-500 px-5 py-2.5 text-xs font-semibold text-white shadow hover:bg-amber-400"
                >
                  <Pause className="h-4 w-4" /> Pause Break
                </button>
                <button
                  disabled={stopTimerMutation.isPending}
                  onClick={() => stopTimerMutation.mutate()}
                  className="flex items-center gap-2 rounded-lg bg-rose-600 px-5 py-2.5 text-xs font-semibold text-white shadow hover:bg-rose-500"
                >
                  <Square className="h-4 w-4" /> Stop & Finalize
                </button>
              </>
            ) : (
              <>
                <button
                  disabled={resumeTimerMutation.isPending}
                  onClick={() => resumeTimerMutation.mutate()}
                  className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white shadow hover:bg-emerald-500"
                >
                  <Play className="h-4 w-4" /> Resume Work
                </button>
                <button
                  disabled={stopTimerMutation.isPending}
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
                Attendance Analytics Graph (Present vs. Absent)
              </h2>
              <p className="text-xs text-zinc-500">
                Daily breakdown of Onsite Present, Remote Present, and Absent counts.
              </p>
            </div>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendChartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="present" fill="#10B981" radius={[4, 4, 0, 0]} name="Present (Onsite)" />
                <Bar dataKey="remote" fill="#3B82F6" radius={[4, 4, 0, 0]} name="Present (Remote)" />
                <Bar dataKey="absent" fill="#F43F5E" radius={[4, 4, 0, 0]} name="Absent / Exceptions" />
              </BarChart>
            </ResponsiveContainer>
          </div>
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
                onClick={() => setCalendarMonth(new Date(year, month - 1, 1))}
                className="rounded-lg border border-zinc-200 p-1.5 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 min-w-[110px] text-center">
                {calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </span>
              <button
                type="button"
                onClick={() => setCalendarMonth(new Date(year, month + 1, 1))}
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

              const dayPresent = dayRecords.filter(
                (r) => r.status === 'PRESENT' || r.status === 'PRESENT_REMOTE',
              ).length;
              const dayAbsent = dayRecords.filter(
                (r) => r.status === 'ABSENT',
              ).length;
              const dayReview = dayRecords.filter((r) => r.status === 'ABSENT_PENDING_REVIEW').length;
              const dayOnLeave = dayRecords.filter((r) => r.status === 'ON_LEAVE').length;
              const singleStatus = dayRecords[0]?.status ?? (isToday ? attendance?.status : null);

              let cellBadge = null;
              if (dayRecords.length > 1) {
                cellBadge = (
                  <div className="mt-1 flex flex-wrap gap-0.5 text-[9px] font-semibold">
                    <span title="Present" className="rounded bg-emerald-100 px-1 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                      {dayPresent} P
                    </span>
                    {dayAbsent > 0 && <span title="Absent" className="rounded bg-rose-100 px-1 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">{dayAbsent} A</span>}
                    {dayReview > 0 && <span title="Pending review" className="rounded bg-amber-100 px-1 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">{dayReview} R</span>}
                    {dayOnLeave > 0 && <span title="On Leave" className="rounded bg-indigo-100 px-1 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">{dayOnLeave} L</span>}
                  </div>
                );
              } else if (singleStatus) {
                const color = singleStatus === 'PRESENT' || singleStatus === 'PRESENT_REMOTE'
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                  : singleStatus === 'ABSENT'
                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300';
                cellBadge = (
                  <span className={`mt-1 truncate rounded px-1 py-0.5 text-[9px] font-bold ${color}`}>
                    {calendarStatus[singleStatus] ?? singleStatus}
                  </span>
                );
              } else if (isWeekend) {
                cellBadge = (
                  <span className="mt-1 inline-block text-[9px] text-zinc-400">Off</span>
                );
              }

              return (
                <div
                  key={cell.dateStr}
                  aria-current={isToday ? 'date' : undefined}
                  className={`h-14 rounded-lg border p-1.5 flex flex-col justify-between text-xs transition ${
                    isToday
                      ? 'border-indigo-500 bg-indigo-50/30 dark:bg-indigo-950/30 ring-1 ring-indigo-500'
                      : 'border-zinc-100 bg-white dark:border-zinc-800 dark:bg-zinc-900'
                  }`}
                >
                  <span
                    className={`text-[11px] font-bold ${
                      isToday
                        ? 'text-indigo-600 dark:text-indigo-400'
                        : isWeekend
                          ? 'text-zinc-400'
                          : 'text-zinc-700 dark:text-zinc-300'
                    }`}
                  >
                    {cell.day}
                  </span>
                  {cellBadge}
                </div>
              );
            })}
          </div>
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
                {(!whitelistData?.items || whitelistData.items.length === 0) ? (
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
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between pb-4 border-b border-zinc-200 dark:border-zinc-800">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Home className="h-5 w-5 text-indigo-600" /> Request Remote Work (WFH)
              </h3>
              <button
                type="button"
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
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Start Date *
                </label>
                <input
                  type="date"
                  required
                  value={remoteStartDate}
                  onChange={(e) => setRemoteStartDate(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-800"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  End Date *
                </label>
                <input
                  type="date"
                  required
                  min={remoteStartDate || undefined}
                  value={remoteEndDate}
                  onChange={(e) => setRemoteEndDate(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-800"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Reason / Justification *
                </label>
                <textarea
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
                <p role="alert" className="text-xs text-rose-700 dark:text-rose-300">{createRemoteMutation.error.message}</p>
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
