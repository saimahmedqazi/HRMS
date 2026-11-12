'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth, type UserRole } from '@/lib/auth-context';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { SupportModeBanner } from '@/components/layout/support-mode-banner';

const tenantRouteRoles: Partial<Record<string, readonly UserRole[]>> = {
  '/dashboard/payroll': ['COMPANY_ADMIN', 'HR_MANAGER'],
  '/dashboard/attendance/exceptions': ['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER'],
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login');
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          <p className="text-sm text-slate-500">Loading session...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;
  const requiredRoles = tenantRouteRoles[pathname];
  const canOpenRoute = !requiredRoles || (
    requiredRoles.includes(user.role) && Boolean(user.companyId || user.supportModeCompanyId)
  );

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
      <Sidebar isOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <Header onMenuClick={() => setMobileMenuOpen(true)} />
        <SupportModeBanner />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 min-w-0">
          {canOpenRoute ? children : (
            <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Access Denied</h1>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">You don’t have access to this page.</p>
              <Link href="/dashboard" className="mt-4 inline-flex text-sm font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
                Return to Dashboard
              </Link>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
