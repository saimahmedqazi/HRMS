'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { User, Mail, Shield, Building2 } from 'lucide-react';

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
    </div>
  );
}
