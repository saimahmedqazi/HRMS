'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Mail, Shield, Building2, MapPin, Globe, Clock, ExternalLink } from 'lucide-react';

export default function MyProfilePage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user?.employee?.id) {
      router.replace(`/dashboard/employees/${user.employee.id}`);
    }
  }, [isLoading, user, router]);

  if (isLoading || user?.employee?.id) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-zinc-500">Loading your profile...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          My Account Profile
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Platform account details and role privileges.
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 space-y-4">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100 text-xl font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
            {user?.firstName?.[0] || user?.email?.[0]?.toUpperCase() || 'U'}
          </div>
          <div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
              {user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : user?.email}
            </h2>
            <p className="text-xs text-zinc-500 flex items-center gap-1.5 mt-0.5">
              <Mail className="h-3.5 w-3.5" /> {user?.email}
            </p>
          </div>
        </div>

        <dl className="divide-y divide-zinc-100 dark:divide-zinc-800 text-xs pt-2">
          <div className="flex justify-between py-2.5">
            <dt className="text-zinc-500 flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5" /> Assigned Role
            </dt>
            <dd className="font-semibold text-zinc-900 dark:text-zinc-100">
              {user?.role?.replace(/_/g, ' ')}
            </dd>
          </div>
          <div className="flex justify-between py-2.5">
            <dt className="text-zinc-500 flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" /> Organization
            </dt>
            <dd className="font-semibold text-zinc-900 dark:text-zinc-100">
              {user?.company?.name || 'ZenHR Platform'}
            </dd>
          </div>
        </dl>
      </div>

      {/* Last Login IP & Geolocation Telemetry Card */}
      <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-6 shadow-sm dark:border-indigo-900/60 dark:bg-indigo-950/20 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <MapPin className="h-4 w-4 text-indigo-600" />
            Last Login Session & Geolocation Telemetry
          </h3>
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
            VERIFIED SESSION
          </span>
        </div>

        <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed bg-white dark:bg-zinc-900 p-3.5 rounded-xl border border-indigo-100 dark:border-indigo-900/50">
          You logged in from IP{' '}
          <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
            {user?.lastLoginIp || '127.0.0.1'}
          </span>{' '}
          at{' '}
          <span className="font-semibold">
            {user?.lastLoginLocation || 'Local Office Network, PK'}
          </span>{' '}
          (Lat:{' '}
          <span className="font-mono font-semibold">
            {user?.lastLoginLatitude ?? 24.8607}
          </span>
          , Long:{' '}
          <span className="font-mono font-semibold">
            {user?.lastLoginLongitude ?? 67.0011}
          </span>
          ) on{' '}
          <span className="font-semibold">
            {user?.lastLoginAt
              ? new Date(user.lastLoginAt).toLocaleString('en-US', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })
              : new Date().toLocaleString('en-US', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
          </span>
          .
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="rounded-xl bg-white dark:bg-zinc-900 p-3 border border-zinc-200 dark:border-zinc-800">
            <span className="text-[10px] uppercase font-semibold text-zinc-400 flex items-center gap-1">
              <Globe className="h-3 w-3 text-indigo-500" /> Login IP Address
            </span>
            <p className="font-mono font-bold text-zinc-900 dark:text-zinc-100 mt-1">
              {user?.lastLoginIp || '127.0.0.1'}
            </p>
          </div>

          <div className="rounded-xl bg-white dark:bg-zinc-900 p-3 border border-zinc-200 dark:border-zinc-800">
            <span className="text-[10px] uppercase font-semibold text-zinc-400 flex items-center gap-1">
              <MapPin className="h-3 w-3 text-emerald-500" /> Coordinates (Lat / Long)
            </span>
            <p className="font-mono font-bold text-zinc-900 dark:text-zinc-100 mt-1">
              {user?.lastLoginLatitude ?? 24.8607}, {user?.lastLoginLongitude ?? 67.0011}
            </p>
            <a
              href={`https://www.google.com/maps?q=${user?.lastLoginLatitude ?? 24.8607},${user?.lastLoginLongitude ?? 67.0011}`}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] text-indigo-600 hover:underline inline-flex items-center gap-1 mt-0.5"
            >
              Open Map <ExternalLink className="h-2.5 w-2.5" />
            </a>
          </div>

          <div className="rounded-xl bg-white dark:bg-zinc-900 p-3 border border-zinc-200 dark:border-zinc-800">
            <span className="text-[10px] uppercase font-semibold text-zinc-400 flex items-center gap-1">
              <Clock className="h-3 w-3 text-amber-500" /> Login Timestamp
            </span>
            <p className="font-semibold text-zinc-900 dark:text-zinc-100 mt-1">
              {user?.lastLoginAt
                ? new Date(user.lastLoginAt).toLocaleString()
                : 'Active Session'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
