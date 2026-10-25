'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/ui/status-badge';
import { ArrowLeft, Calendar, Search } from 'lucide-react';

export default function AttendanceHistoryPage() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const { data: recordsData, isLoading } = useQuery({
    queryKey: ['attendance-records', startDate, endDate],
    queryFn: () => {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      return api.get<any[]>(`/attendance/records?${params.toString()}`);
    },
  });

  const records = recordsData || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/attendance"
          className="rounded-lg border border-zinc-200 p-2 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-400"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Calendar className="h-6 w-6 text-indigo-600" /> Attendance History Log
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            View attendance punches, work hours, and overtime across your authorized data scope.
          </p>
        </div>
      </div>

      {/* Date Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
            Start Date
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="mt-1 block rounded-lg border border-zinc-300 px-3 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-800"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
            End Date
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="mt-1 block rounded-lg border border-zinc-300 px-3 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-800"
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
          <thead>
            <tr className="bg-zinc-50 dark:bg-zinc-900/50">
              <th className="py-3.5 pl-6 pr-3 text-left text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                Date
              </th>
              <th className="px-3 py-3.5 text-left text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                Employee
              </th>
              <th className="px-3 py-3.5 text-left text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                Status
              </th>
              <th className="px-3 py-3.5 text-left text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                Check In / Out
              </th>
              <th className="px-3 py-3.5 text-right text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                Work Minutes
              </th>
              <th className="px-3 py-3.5 text-right text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                Overtime
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-sm text-zinc-500">
                  Loading attendance records...
                </td>
              </tr>
            ) : records.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-sm text-zinc-500">
                  No attendance records found for this period.
                </td>
              </tr>
            ) : (
              records.map((r: any) => (
                <tr key={r.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                  <td className="py-4 pl-6 pr-3 text-xs font-medium text-zinc-900 dark:text-zinc-100">
                    {new Date(r.date).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-4 text-xs text-zinc-800 dark:text-zinc-200">
                    {r.employee?.firstName} {r.employee?.lastName}
                    <span className="block text-[11px] text-zinc-400">
                      {r.employee?.department?.name || '—'}
                    </span>
                  </td>
                  <td className="px-3 py-4 text-xs">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-3 py-4 text-xs text-zinc-600 dark:text-zinc-400">
                    {r.checkInTime ? new Date(r.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                    {' → '}
                    {r.checkOutTime ? new Date(r.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                  </td>
                  <td className="px-3 py-4 text-right text-xs font-medium text-zinc-800 dark:text-zinc-200">
                    {r.workMinutes}m
                  </td>
                  <td className="px-3 py-4 text-right text-xs font-medium text-indigo-600 dark:text-indigo-400">
                    {r.overtimeMinutes > 0 ? `+${r.overtimeMinutes}m` : '0m'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
