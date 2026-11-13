'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { io } from 'socket.io-client';
import {
  Bell,
  ShieldCheck,
  Moon,
  Sun,
  CheckCheck,
  CreditCard,
  PackageCheck,
  UserPlus,
  Clock,
  AlertTriangle,
  X,
  Menu,
} from 'lucide-react';

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  isRead: boolean;
  type: string;
}

interface HeaderProps {
  onMenuClick?: () => void;
  mobileMenuOpen?: boolean;
}

const timeAgo = (dateStr: string) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

export function Header({ onMenuClick, mobileMenuOpen }: HeaderProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isDark, setIsDark] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);
  const canReceiveBreakAlerts = Boolean(user?.companyId && ['COMPANY_ADMIN', 'HR_MANAGER', 'DEPARTMENT_MANAGER', 'TEAM_LEAD'].includes(user.role));

  useEffect(() => {
    if (!canReceiveBreakAlerts) return;

    const socket = io('/ws/attendance', {
      path: '/api/attendance-events',
      addTrailingSlash: false,
      transports: ['polling'],
    });
    let active = true;
    const refreshNotifications = () => void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    socket.on('attendance_ready', refreshNotifications);
    socket.on('break_alert', refreshNotifications);
    socket.on('disconnect', (reason) => {
      if (reason === 'io server disconnect') {
        void api.get('/auth/me').then(() => { if (active) socket.connect(); }).catch(() => {});
      }
    });
    return () => {
      active = false;
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [canReceiveBreakAlerts, queryClient, user?.companyId, user?.id]);

  const { data: notifications = [] } = useQuery<NotificationItem[]>({
    queryKey: ['notifications', user?.id, user?.supportModeCompanyId ? null : user?.companyId ?? null],
    queryFn: () => api.get<NotificationItem[]>('/notifications'),
    enabled: Boolean(user?.id),
    refetchInterval: 30_000,
    retry: false,
  });

  const markAllMutation = useMutation({
    mutationFn: () => api.patch('/notifications/mark-all-read', {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const markAllAsRead = () => {
    markAllMutation.mutate();
  };

  // Sync theme with DOM and localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
      document.documentElement.classList.add('dark');
      setIsDark(true);
    } else {
      document.documentElement.classList.remove('dark');
      setIsDark(false);
    }
  }, []);

  const toggleTheme = () => {
    if (isDark) {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
      setIsDark(false);
    } else {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
      setIsDark(true);
    }
  };

  // Close notifications on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 md:px-6 dark:border-slate-800 dark:bg-slate-900 shrink-0 transition-colors">
      <div className="flex items-center gap-3">
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-dashboard-navigation"
            aria-haspopup="dialog"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 md:hidden"
            title="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
        <span className="text-base font-semibold text-slate-800 dark:text-slate-100">
          ZenHR Portal
        </span>
        {user?.company?.subscriptionTier && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
            <ShieldCheck className="h-3 w-3" />
            {user.company.subscriptionTier} TIER
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* Theme Toggle Button */}
        <button
          type="button"
          onClick={toggleTheme}
          title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          className="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
        >
          {isDark ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-slate-600" />}
        </button>

        {/* Notifications Popover */}
        <div className="relative" ref={notificationRef}>
          <button
            type="button"
            onClick={() => setShowNotifications(!showNotifications)}
            title="Notifications"
            className="relative rounded-xl p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600"></span>
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95">
              <div className="p-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                    Notifications
                  </h3>
                  {unreadCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-[10px] font-bold">
                      {unreadCount} new
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    Mark all read
                  </button>
                )}
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-800/60 max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400">
                    No notifications yet.
                  </div>
                ) : (
                  notifications.map((item) => (
                    <div
                      key={item.id}
                      className={`p-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition flex items-start gap-3 ${
                        !item.isRead ? 'bg-blue-50/40 dark:bg-blue-950/20' : ''
                      }`}
                    >
                      <div className="mt-0.5 p-2 rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400 flex-shrink-0">
                        {item.type === 'PAYROLL' && <CreditCard className="w-3.5 h-3.5" />}
                        {item.type === 'RESOURCE' && <PackageCheck className="w-3.5 h-3.5" />}
                        {item.type === 'IMPORT' && <UserPlus className="w-3.5 h-3.5" />}
                        {item.type === 'ATTENDANCE_EXCEPTION' && <AlertTriangle className="w-3.5 h-3.5" />}
                        {item.type === 'GENERAL' && <Clock className="w-3.5 h-3.5" />}
                        {!['PAYROLL', 'RESOURCE', 'IMPORT', 'ATTENDANCE_EXCEPTION', 'GENERAL'].includes(item.type) && (
                          <Bell className="w-3.5 h-3.5" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                            {item.title}
                          </p>
                          <span className="text-[10px] text-slate-400 flex-shrink-0">{timeAgo(item.createdAt)}</span>
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 line-clamp-2 leading-relaxed">
                          {item.body}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Avatar & Name */}
        <div className="flex items-center gap-2 border-l border-slate-200 pl-3 dark:border-slate-800">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100 text-blue-700 font-bold text-xs dark:bg-blue-900 dark:text-blue-200 shadow-sm">
            {user?.firstName && user?.lastName
              ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
              : user?.email
              ? user.email.slice(0, 2).toUpperCase()
              : 'U'}
          </div>
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 hidden sm:inline-block">
            {user?.firstName
              ? `${user.firstName} ${user.lastName || ''}`.trim()
              : user?.email || 'User'}
          </span>
        </div>
      </div>
    </header>
  );
}
