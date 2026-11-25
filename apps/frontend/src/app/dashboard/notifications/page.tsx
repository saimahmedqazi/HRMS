'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { resolveNotificationHref } from '@/lib/notification-links';
import {
  Bell,
  CheckCheck,
  Check,
  CreditCard,
  PackageCheck,
  UserPlus,
  AlertTriangle,
  Clock,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';

interface NotificationRecord {
  id: string;
  title: string;
  body: string;
  type: string;
  data?: Record<string, unknown> | null;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
}

interface PaginatedNotificationsResponse {
  items: NotificationRecord[];
  total: number;
  unreadCount: number;
  page: number;
  limit: number;
  totalPages: number;
}

type StatusFilter = 'all' | 'unread' | 'read';

const PAGE_LIMIT = 20;

const TYPE_LABELS: Record<string, string> = {
  LEAVE: 'Leave',
  ATTENDANCE_EXCEPTION: 'Attendance',
  RESOURCE: 'Resources',
  PAYROLL: 'Payroll',
  IMPORT: 'Bulk Import',
  GENERAL: 'General',
};

function NotificationIcon({ type }: { type: string }) {
  switch (type) {
    case 'PAYROLL':
      return <CreditCard className="h-4 w-4" />;
    case 'RESOURCE':
      return <PackageCheck className="h-4 w-4" />;
    case 'IMPORT':
      return <UserPlus className="h-4 w-4" />;
    case 'ATTENDANCE_EXCEPTION':
      return <AlertTriangle className="h-4 w-4" />;
    case 'GENERAL':
      return <Clock className="h-4 w-4" />;
    default:
      return <Bell className="h-4 w-4" />;
  }
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);

  const scopeKey = user?.supportModeCompanyId ? null : user?.companyId ?? null;

  const { data, isLoading, isError, refetch } = useQuery<PaginatedNotificationsResponse>({
    queryKey: ['notifications', 'history', user?.id, scopeKey, statusFilter, page],
    queryFn: () =>
      api.get<PaginatedNotificationsResponse>(
        `/notifications?paginated=true&page=${page}&limit=${PAGE_LIMIT}&status=${statusFilter}`,
      ),
    enabled: Boolean(user?.id),
    refetchInterval: 30_000,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllMutation = useMutation({
    mutationFn: () => api.patch('/notifications/mark-all-read', {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const unreadCount = data?.unreadCount ?? 0;
  const totalPages = data?.totalPages ?? 1;

  const handleOpenNotification = async (item: NotificationRecord) => {
    if (!item.isRead) {
      try {
        await markReadMutation.mutateAsync(item.id);
      } catch {
        // Navigation should still proceed even if read receipt fails transiently.
      }
    }
    router.push(resolveNotificationHref(item, user?.role));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Notifications
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Full activity history across leave, attendance, payroll, and workspace updates.
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            disabled={markAllMutation.isPending}
            onClick={() => markAllMutation.mutate()}
            className="inline-flex items-center gap-1.5 self-start rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <CheckCheck className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            Mark all read ({unreadCount})
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200 pb-3 dark:border-zinc-800">
        <div className="flex items-center gap-2" role="tablist" aria-label="Notification status filter">
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'unread', label: `Unread (${unreadCount})` },
              { id: 'read', label: 'Read' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={statusFilter === tab.id}
              onClick={() => {
                setStatusFilter(tab.id);
                setPage(1);
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                statusFilter === tab.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {total} total
        </span>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center rounded-xl border border-zinc-200 bg-white p-12 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
          <div className="flex items-center gap-2 font-semibold">
            <AlertCircle className="h-4 w-4" />
            Unable to load notifications.
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-2 font-semibold underline"
          >
            Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <Bell className="mx-auto h-8 w-8 text-zinc-400" />
          <p className="mt-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            No notifications found
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {statusFilter === 'unread'
              ? 'You are all caught up on unread notifications.'
              : 'Notifications will appear here as activity occurs.'}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
          {items.map((item) => (
            <div
              key={item.id}
              className={`flex flex-col gap-3 p-4 transition sm:flex-row sm:items-center sm:justify-between ${
                !item.isRead ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : ''
              }`}
            >
              <button
                type="button"
                onClick={() => void handleOpenNotification(item)}
                className="flex min-w-0 flex-1 items-start gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-lg"
              >
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
                  <NotificationIcon type={item.type} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {item.title}
                    </span>
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      {TYPE_LABELS[item.type] || item.type}
                    </span>
                    {!item.isRead && (
                      <span className="h-2 w-2 rounded-full bg-indigo-600" aria-label="Unread" />
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                    {item.body}
                  </p>
                  <p className="mt-1.5 text-[11px] text-zinc-400">
                    {new Date(item.createdAt).toLocaleString()}
                  </p>
                </div>
              </button>

              <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
                {!item.isRead ? (
                  <button
                    type="button"
                    disabled={markReadMutation.isPending}
                    onClick={() => markReadMutation.mutate(item.id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Mark read
                  </button>
                ) : (
                  <span className="text-[11px] font-medium text-zinc-400">Read</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
