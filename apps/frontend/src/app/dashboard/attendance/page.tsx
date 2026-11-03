'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
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
  const [coords, setCoords] = useState<{ latitude?: number; longitude?: number }>({});
  const [newWhitelistIp, setNewWhitelistIp] = useState('');
  const [newWhitelistDesc, setNewWhitelistDesc] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  useEffect(() => {
    if (typeof window !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCoords({
            latitude: Number(pos.coords.latitude.toFixed(6)),
            longitude: Number(pos.coords.longitude.toFixed(6)),
          });
        },
        () => {},
        { timeout: 3000, maximumAge: 60000 },
      );
    }
  }, []);

  // Fetch today's attendance
  const { data: attendanceData } = useQuery({
    queryKey: ['attendance-today'],
    queryFn: () => api.get<any>('/attendance/today'),
  });

  // Fetch today's work timer
  const { data: timerData } = useQuery({
    queryKey: ['timer-today'],
    queryFn: () => api.get<any>('/timer/today'),
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
  });

  // Fetch IP Whitelist & current client IP telemetry
  const { data: whitelistData } = useQuery({
    queryKey: ['attendance-ip-whitelist'],
    queryFn: () => api.get<any>('/attendance/ip-whitelist'),
  });

  const attendance = attendanceData;
  const timer = timerData;
  const recordsList: any[] = Array.isArray(recordsData)
    ? recordsData
    : recordsData?.data || [];

  // Local clock ticker for running timer
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (timer && timer.status === 'RUNNING') {
      const startTime = new Date(timer.startedAt).getTime();
      const breaksTotalMs = (timer.breaks || []).reduce(
        (sum: number, b: any) => sum + (b.durationMin || 0) * 60000,
        0,
      );
      interval = setInterval(() => {
        const elapsedMs = Math.max(0, Date.now() - startTime - breaksTotalMs);
        setTimerSeconds(Math.floor(elapsedMs / 1000));
      }, 1000);
    } else if (timer && timer.totalMinutes) {
      setTimerSeconds(timer.totalMinutes * 60);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [timer]);

  // Mutations
  const checkInMutation = useMutation({
    mutationFn: () =>
      api.post('/attendance/check-in', {
        isRemote,
        notes: notes || undefined,
        ...(coords.latitude !== undefined ? { latitude: coords.latitude } : {}),
        ...(coords.longitude !== undefined ? { longitude: coords.longitude } : {}),
      }),
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

  const checkOutMutation = useMutation({
    mutationFn: () => api.post('/attendance/check-out', {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance-today'] });
      queryClient.invalidateQueries({ queryKey: ['attendance-records'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] });
    },
  });

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
    },
  });

  const formatSeconds = (sec: number) => {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Compute Present / Remote / Exceptions / Absent summary counts
  const presentCount = recordsList.filter((r) => r.status === 'PRESENT').length;
  const remoteCount = recordsList.filter((r) => r.status === 'PRESENT_REMOTE').length;
  const exceptionCount = recordsList.filter(
    (r) => r.status === 'ABSENT_PENDING_REVIEW' || r.status === 'LATE',
  ).length;
  const absentCount = recordsList.filter((r) => r.status === 'ABSENT').length;

  const statusBreakdownChart = [
    {
      category: 'Present (Onsite)',
      Present: isHrOrAdmin
        ? overviewData?.todaySummary?.present ?? presentCount
        : presentCount,
      Remote: 0,
      Absent: 0,
      Exceptions: 0,
    },
    {
      category: 'Present (Remote)',
      Present: 0,
      Remote: isHrOrAdmin
        ? overviewData?.todaySummary?.remote ?? remoteCount
        : remoteCount,
      Absent: 0,
      Exceptions: 0,
    },
    {
      category: 'Absent',
      Present: 0,
      Remote: 0,
      Absent: isHrOrAdmin
        ? overviewData?.todaySummary?.absent ?? absentCount
        : absentCount,
      Exceptions: 0,
    },
    {
      category: 'Exceptions / Late',
      Present: 0,
      Remote: 0,
      Absent: 0,
      Exceptions: isHrOrAdmin
        ? overviewData?.pendingExceptions ?? exceptionCount
        : exceptionCount,
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
            {isHrOrAdmin ? (overviewData?.todaySummary?.present ?? presentCount) : presentCount}
          </p>
          <span className="text-[11px] text-zinc-400">Verified onsite check-ins</span>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <span className="text-[11px] font-semibold uppercase text-zinc-500">Present (Remote)</span>
          <p className="mt-1 text-2xl font-extrabold text-blue-600 dark:text-blue-400">
            {isHrOrAdmin ? (overviewData?.todaySummary?.remote ?? remoteCount) : remoteCount}
          </p>
          <span className="text-[11px] text-zinc-400">Authorized remote sessions</span>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <span className="text-[11px] font-semibold uppercase text-zinc-500">Absent Count</span>
          <p className="mt-1 text-2xl font-extrabold text-rose-600 dark:text-rose-400">
            {isHrOrAdmin ? (overviewData?.todaySummary?.absent ?? absentCount) : absentCount}
          </p>
          <span className="text-[11px] text-zinc-400">Unexcused / no check-in</span>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <span className="text-[11px] font-semibold uppercase text-zinc-500">Exceptions / Pending</span>
          <p className="mt-1 text-2xl font-extrabold text-amber-600 dark:text-amber-400">
            {isHrOrAdmin ? (overviewData?.pendingExceptions ?? exceptionCount) : exceptionCount}
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
                    {whitelistData?.currentClientIp || user?.lastLoginIp || '127.0.0.1'}
                  </strong>
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-emerald-600" />
                  Lat/Long:{' '}
                  <strong className="font-mono text-zinc-900 dark:text-zinc-100">
                    {coords.latitude ?? whitelistData?.currentGeo?.latitude ?? 24.8607},{' '}
                    {coords.longitude ?? whitelistData?.currentGeo?.longitude ?? 67.0011}
                  </strong>
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    whitelistData?.isCurrentIpWhitelisted
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                      : 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                  }`}
                >
                  {whitelistData?.isCurrentIpWhitelisted ? 'HR Whitelisted IP' : 'Standard IP'}
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
                <CheckCircle className="h-4 w-4" /> You are currently checked in today.
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
              Shift completed for today. Total work: {attendance.workMinutes || 0}m (Overtime:{' '}
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
              const isToday = new Date().toISOString().slice(0, 10) === cell.dateStr;

              const dayPresent = dayRecords.filter(
                (r) => r.status === 'PRESENT' || r.status === 'PRESENT_REMOTE',
              ).length;
              const dayAbsent = dayRecords.filter(
                (r) => r.status === 'ABSENT' || r.status === 'ABSENT_PENDING_REVIEW',
              ).length;

              let cellBadge = null;
              if (dayRecords.length > 0) {
                if (isHrOrAdmin && dayRecords.length > 1) {
                  cellBadge = (
                    <div className="mt-1 flex flex-col gap-0.5 text-[9px] font-semibold">
                      <span className="rounded bg-emerald-100 px-1 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                        {dayPresent} P
                      </span>
                      {dayAbsent > 0 && (
                        <span className="rounded bg-rose-100 px-1 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                          {dayAbsent} A
                        </span>
                      )}
                    </div>
                  );
                } else {
                  const st = dayRecords[0].status;
                  const isPres = st === 'PRESENT' || st === 'PRESENT_REMOTE';
                  cellBadge = (
                    <span
                      className={`mt-1 inline-block rounded px-1 py-0.5 text-[9px] font-bold truncate ${
                        isPres
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                      }`}
                    >
                      {st === 'PRESENT_REMOTE' ? 'Remote' : isPres ? 'Present' : 'Absent'}
                    </span>
                  );
                }
              } else if (isToday && attendance?.status) {
                cellBadge = (
                  <span className="mt-1 inline-block rounded bg-emerald-100 px-1 py-0.5 text-[9px] font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                    Present
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
    </div>
  );
}
