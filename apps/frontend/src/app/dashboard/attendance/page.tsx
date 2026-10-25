'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
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
} from 'lucide-react';

export default function AttendanceDashboardPage() {
  const queryClient = useQueryClient();
  const [isRemote, setIsRemote] = useState(false);
  const [notes, setNotes] = useState('');
  const [timerSeconds, setTimerSeconds] = useState(0);

  // Fetch today's attendance
  const { data: attendanceData, isLoading: loadingAttendance } = useQuery({
    queryKey: ['attendance-today'],
    queryFn: () => api.get<any>('/attendance/today'),
  });

  // Fetch today's work timer
  const { data: timerData, isLoading: loadingTimer } = useQuery({
    queryKey: ['timer-today'],
    queryFn: () => api.get<any>('/timer/today'),
  });

  const attendance = attendanceData;
  const timer = timerData;

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
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance-today'] });
      setNotes('');
    },
  });

  const checkOutMutation = useMutation({
    mutationFn: () => api.post('/attendance/check-out', {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance-today'] });
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

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Attendance & Work Timer
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Log your daily punches, track work intervals, and review attendance history.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/attendance/exceptions"
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
          >
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> Exceptions Queue
          </Link>
          <Link
            href="/dashboard/attendance/history"
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
          >
            <History className="h-3.5 w-3.5" /> History Log
          </Link>
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
                <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 p-2.5 rounded-lg border border-amber-200 dark:border-amber-900">
                  ⚠️ Remote check-ins without an approved standing permission are routed to the HR
                  Exceptions Queue for review.
                </p>
              )}

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
    </div>
  );
}
