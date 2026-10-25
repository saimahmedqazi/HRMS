'use client';

import React from 'react';
import { useAuth } from '@/lib/auth-context';
import { Bell, ShieldCheck } from 'lucide-react';

export function Header() {
  const { user } = useAuth();

  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6 dark:border-slate-800 dark:bg-slate-900 shrink-0">
      <div className="flex items-center gap-3">
        <h1 className="text-base font-semibold text-slate-800 dark:text-slate-100">
          ZenHR Portal
        </h1>
        {user?.company?.subscriptionTier && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
            <ShieldCheck className="h-3 w-3" />
            {user.company.subscriptionTier} TIER
          </span>
        )}
      </div>

      <div className="flex items-center gap-4">
        <button
          title="Notifications"
          className="relative rounded-full p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-blue-600" />
        </button>

        <div className="flex items-center gap-2 border-l border-slate-200 pl-4 dark:border-slate-800">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-700 font-semibold text-xs dark:bg-blue-900 dark:text-blue-200">
            {user ? `${user.firstName[0]}${user.lastName[0]}` : 'U'}
          </div>
          <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
            {user?.firstName}
          </span>
        </div>
      </div>
    </header>
  );
}
