'use client';

import React from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/ui/status-badge';
import { AlertTriangle, Check, X, ArrowLeft, ShieldAlert, Clock } from 'lucide-react';

export default function AttendanceExceptionsPage() {
  const queryClient = useQueryClient();

  const { data: exceptionsData, isLoading } = useQuery({
    queryKey: ['attendance-exceptions'],
    queryFn: () => api.get<any[]>('/attendance/exceptions'),
  });

  const exceptions = exceptionsData || [];

  const resolveMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'APPROVE' | 'REJECT' }) =>
      api.post(`/attendance/exceptions/${id}/resolve`, { action }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance-exceptions'] });
    },
  });

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
            <AlertTriangle className="h-6 w-6 text-amber-500" /> HR Exceptions Queue
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Review and resolve unauthorized remote check-in requests pending HR verification.
          </p>
        </div>
      </div>

      {/* Exceptions Table */}
      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
          <thead>
            <tr className="bg-zinc-50 dark:bg-zinc-900/50">
              <th className="py-3.5 pl-6 pr-3 text-left text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                Employee
              </th>
              <th className="px-3 py-3.5 text-left text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                Department
              </th>
              <th className="px-3 py-3.5 text-left text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                Check-in Time
              </th>
              <th className="px-3 py-3.5 text-left text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                Client IP
              </th>
              <th className="px-3 py-3.5 text-right text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {isLoading ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-sm text-zinc-500">
                  Loading exceptions...
                </td>
              </tr>
            ) : exceptions.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-sm text-zinc-500">
                  <ShieldAlert className="mx-auto h-8 w-8 text-zinc-400 mb-2" />
                  No pending attendance exceptions! All check-ins are verified.
                </td>
              </tr>
            ) : (
              exceptions.map((ex: any) => (
                <tr key={ex.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                  <td className="py-4 pl-6 pr-3 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    <div>
                      {ex.employee?.firstName} {ex.employee?.lastName}
                      <span className="block text-xs font-normal text-zinc-500">
                        {ex.employee?.employeeCode}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-4 text-xs text-zinc-600 dark:text-zinc-400">
                    {ex.employee?.department?.name || '—'}
                  </td>
                  <td className="px-3 py-4 text-xs text-zinc-600 dark:text-zinc-400">
                    {ex.checkInTime ? new Date(ex.checkInTime).toLocaleString() : '—'}
                  </td>
                  <td className="px-3 py-4 text-xs font-mono text-zinc-500">
                    {ex.checkInIp || 'Unknown'}
                  </td>
                  <td className="px-3 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        disabled={resolveMutation.isPending}
                        onClick={() => resolveMutation.mutate({ id: ex.id, action: 'APPROVE' })}
                        className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300"
                        title="Approve as Remote Check-in"
                      >
                        <Check className="h-3.5 w-3.5" /> Approve
                      </button>
                      <button
                        disabled={resolveMutation.isPending}
                        onClick={() => resolveMutation.mutate({ id: ex.id, action: 'REJECT' })}
                        className="inline-flex items-center gap-1 rounded bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 dark:bg-rose-950 dark:text-rose-300"
                        title="Reject and Mark Absent"
                      >
                        <X className="h-3.5 w-3.5" /> Reject
                      </button>
                    </div>
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
