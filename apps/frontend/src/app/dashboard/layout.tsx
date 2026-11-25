'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { MotionConfig, motion } from 'framer-motion';
import { useAuth, type UserProfile, type UserRole } from '@/lib/auth-context';
import { api, ApiError } from '@/lib/api';
import { Eye, EyeOff, KeyRound } from 'lucide-react';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { SupportModeBanner } from '@/components/layout/support-mode-banner';

const tenantRouteRoles: Partial<Record<string, readonly UserRole[]>> = {
  '/dashboard/payroll': ['COMPANY_ADMIN', 'HR_MANAGER'],
  '/dashboard/attendance/exceptions': ['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER'],
};

const moduleRoutePrefixes: ReadonlyArray<readonly [string, string]> = [
  ['/dashboard/employees', 'employees'],
  ['/dashboard/team-members', 'team-members'],
  ['/dashboard/departments', 'departments'],
  ['/dashboard/attendance', 'attendance'],
  ['/dashboard/my-attendance', 'my-attendance'],
  ['/dashboard/work-timer', 'work-timer'],
  ['/dashboard/leave-approvals', 'leave-approvals'],
  ['/dashboard/my-leave', 'my-leave'],
  ['/dashboard/leave', 'leave'],
  ['/dashboard/payroll-view', 'payroll-view'],
  ['/dashboard/my-payslips', 'my-payslips'],
  ['/dashboard/payroll', 'payroll'],
  ['/dashboard/bulk-import', 'bulk-import'],
  ['/dashboard/resources', 'resources'],
  ['/dashboard/ai-assistant', 'ai-assistant'],
  ['/dashboard/my-profile', 'my-profile'],
  ['/dashboard/support-mode', 'support-mode'],
  ['/dashboard/companies', 'companies'],
  ['/dashboard/billing', 'billing'],
  ['/dashboard/notifications', 'notifications'],
  ['/dashboard/settings', 'settings'],
];

function hasModuleAccess(pathname: string, user: UserProfile, allowedModules: string[]): boolean {
  if (pathname === '/dashboard' || pathname === '/dashboard/') {
    return allowedModules.includes('dashboard');
  }

  const employeeDetailPrefix = '/dashboard/employees/';
  if (pathname.startsWith(employeeDetailPrefix)) {
    if (allowedModules.includes('employees') || allowedModules.includes('team-members')) return true;
    const employeeId = pathname.slice(employeeDetailPrefix.length).split('/')[0];
    return allowedModules.includes('my-profile') && Boolean(user.employee?.id) && employeeId === user.employee?.id;
  }

  const requiredModule = moduleRoutePrefixes.find(([prefix]) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`),
  )?.[1];
  return !requiredModule || allowedModules.includes(requiredModule);
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, allowedModules, modulesLoading, isLoading, sessionUnavailable, sessionExpired, refetchUser, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSubmitting, setPwSubmitting] = useState(false);
  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), []);

  useEffect(() => {
    if (!isLoading && !user && !sessionUnavailable) {
      if (sessionExpired) {
        const params = new URLSearchParams({ expired: '1' });
        if (pathname?.startsWith('/dashboard') && !pathname.includes('//')) {
          params.set('redirect', pathname);
        }
        router.replace(`/login?${params.toString()}`);
      } else {
        router.replace('/login');
      }
    }
  }, [user, isLoading, sessionUnavailable, sessionExpired, pathname, router]);

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

  if (sessionUnavailable) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <p role="alert">We couldn’t check your session. Please try again.</p>
        <button type="button" onClick={() => void refetchUser()}
          className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-medium text-white">
          Try again
        </button>
      </main>
    );
  }

  if (!user) return null;

  if (user.mustChangePassword) {
    const pwInvalid =
      newPw.length < 8 ||
      !/[A-Z]/.test(newPw) ||
      !/[a-z]/.test(newPw) ||
      !/\d/.test(newPw) ||
      newPw !== confirmPw ||
      !curPw;

    const handleMandatoryChange = async (e: React.FormEvent) => {
      e.preventDefault();
      setPwError('');
      if (newPw.length < 8 || !/[A-Z]/.test(newPw) || !/[a-z]/.test(newPw) || !/\d/.test(newPw)) {
        setPwError('New password must be at least 8 characters and include uppercase, lowercase, and numeric characters.');
        return;
      }
      if (newPw !== confirmPw) {
        setPwError('New password and confirmation do not match.');
        return;
      }
      setPwSubmitting(true);
      try {
        await api.post('/auth/change-password', { currentPassword: curPw, newPassword: newPw });
        setCurPw('');
        setNewPw('');
        setConfirmPw('');
        await refetchUser();
      } catch (err) {
        setPwError(err instanceof ApiError ? err.message : 'Unable to update password.');
      } finally {
        setPwSubmitting(false);
      }
    };

    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
            <KeyRound className="h-5 w-5" />
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">Change Temporary Password</h1>
          </div>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Your password was reset by an administrator. Set a new password before continuing to ZenHR.
          </p>
          <form onSubmit={handleMandatoryChange} className="mt-4 space-y-3">
            <div>
              <label htmlFor="mandatory-current-pw" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Temporary Password
              </label>
              <input
                id="mandatory-current-pw"
                type={showPw ? 'text' : 'password'}
                value={curPw}
                onChange={(e) => setCurPw(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label htmlFor="mandatory-new-pw" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                New Password
              </label>
              <div className="relative mt-1">
                <input
                  id="mandatory-new-pw"
                  type={showPw ? 'text' : 'password'}
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-9 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? 'Hide passwords' : 'Show passwords'}
                  className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-700 dark:text-slate-400"
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Minimum 8 characters with uppercase, lowercase, and a number.
              </p>
            </div>
            <div>
              <label htmlFor="mandatory-confirm-pw" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Confirm New Password
              </label>
              <input
                id="mandatory-confirm-pw"
                type={showPw ? 'text' : 'password'}
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            {pwError && (
              <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
                {pwError}
              </p>
            )}
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => void logout()}
                className="text-xs font-medium text-slate-600 hover:underline dark:text-slate-400"
              >
                Sign out
              </button>
              <button
                type="submit"
                disabled={pwSubmitting || pwInvalid}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {pwSubmitting ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </form>
        </div>
      </main>
    );
  }

  const requiredRoles = tenantRouteRoles[pathname];
  const canOpenRoute = !requiredRoles || (
    requiredRoles.includes(user.role) && Boolean(user.companyId || user.supportModeCompanyId)
  );
  const canOpenModule = hasModuleAccess(pathname, user, allowedModules);

  if (modulesLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          <p className="text-sm text-slate-500">Checking page access…</p>
        </div>
      </div>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
        <Sidebar isOpen={mobileMenuOpen} onClose={closeMobileMenu} />
        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
          <Header onMenuClick={() => setMobileMenuOpen(true)} mobileMenuOpen={mobileMenuOpen} />
          <SupportModeBanner />
          <main className="flex-1 overflow-y-auto p-4 md:p-6 min-w-0">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            >
              {canOpenRoute && canOpenModule ? children : (
                <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                  <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Access Denied</h1>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">You don’t have access to this page.</p>
                  <Link href="/dashboard" className="mt-4 inline-flex text-sm font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
                    Return to Dashboard
                  </Link>
                </section>
              )}
            </motion.div>
          </main>
        </div>
      </div>
    </MotionConfig>
  );
}
