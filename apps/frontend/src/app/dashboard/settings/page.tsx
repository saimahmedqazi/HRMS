'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import Link from 'next/link';
import { ShiftPolicies } from '@/components/settings/shift-policies';
import { useAuth, type UserProfile } from '@/lib/auth-context';
import {
  Building2,
  ShieldCheck,
  CalendarDays,
  Lock,
  CheckCircle2,
  AlertTriangle,
  KeyRound,
  Copy,
} from 'lucide-react';
import { PasswordInput } from '@/components/ui/password-input';

type CompanyProfile = {
  name: string;
  phone: string | null;
  address: string | null;
  website: string | null;
  industry: string | null;
  size: string | null;
  timezone: string;
};

export default function SettingsPage() {
  const { user, refetchUser } = useAuth();
  const queryClient = useQueryClient();
  const hasCompany = Boolean(user?.company?.id || user?.supportModeCompanyId);

  const isPlatformRole =
    (user?.role === 'SUPER_ADMIN' || user?.role === 'OPERATION_MANAGER') &&
    !user?.supportModeCompanyId;
  const canManageLeave = hasCompany && user?.role === 'COMPANY_ADMIN' && !user.supportModeCompanyId;
  const canManageCompany = canManageLeave || (hasCompany && (user?.role === 'SUPER_ADMIN' || user?.role === 'HR_MANAGER'));

  const tabs = { platform: isPlatformRole, company: canManageCompany, leave: canManageLeave, security: true };
  const [selectedTab, setActiveTab] = useState<keyof typeof tabs | null>(null);
  const activeTab = selectedTab && tabs[selectedTab]
    ? selectedTab
    : isPlatformRole ? 'platform' : canManageCompany ? 'company' : 'security';
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [operationManagerTempPassword, setOperationManagerTempPassword] = useState<string | null>(null);
  const [operationManagerPasswordCopied, setOperationManagerPasswordCopied] = useState(false);
  const [operationManagerTwoFactorEnabled, setOperationManagerTwoFactorEnabled] = useState(false);

  // Company Settings State
  const companyKey = ['company-me', user?.id, user?.supportModeCompanyId ?? user?.companyId];
  const { data: companyData, isError: companyLoadFailed, isFetching: isLoadingCompany, refetch: refetchCompany } = useQuery({
    queryKey: companyKey,
    queryFn: () => api.get<CompanyProfile>('/companies/me'),
    enabled: canManageCompany,
  });

  const [companyName, setCompanyName] = useState('');
  const [companyPhone, setCompanyPhone] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [companyWebsite, setCompanyWebsite] = useState('');
  const [companyIndustry, setCompanyIndustry] = useState('');
  const [companySize, setCompanySize] = useState('');
  const [companyTimezone, setCompanyTimezone] = useState('UTC');

  // Platform Settings State (for Super Admin / Operation Manager)
  const [supportDurationHours, setSupportDurationHours] = useState(1);
  const [dunningRetryDays, setDunningRetryDays] = useState(3);
  const [maxLoginAttempts, setMaxLoginAttempts] = useState(5);
  const [defaultProbationMonths, setDefaultProbationMonths] = useState(3);

  useEffect(() => {
    if (companyData) {
      setCompanyName(companyData.name || '');
      setCompanyPhone(companyData.phone || '');
      setCompanyAddress(companyData.address || '');
      setCompanyWebsite(companyData.website || '');
      setCompanyIndustry(companyData.industry ?? '');
      setCompanySize(companyData.size ?? '');
      setCompanyTimezone(companyData.timezone || 'UTC');
    }
  }, [companyData]);

  const updateCompanyMutation = useMutation({
    mutationFn: () => {
      if (!companyData) throw new Error('Load the organization profile before saving.');
      if (!companyName.trim()) throw new Error('Enter an organization name.');
      const fields: CompanyProfile = {
        name: companyName.trim(),
        phone: companyPhone.trim() || null,
        address: companyAddress.trim() || null,
        website: companyWebsite.trim() || null,
        industry: companyIndustry.trim() || null,
        size: companySize.trim() || null,
        timezone: companyTimezone.trim(),
      };
      const payload = Object.fromEntries((Object.keys(fields) as (keyof CompanyProfile)[])
        .filter((field) => fields[field] !== companyData[field])
        .map((field) => [field, fields[field]]));
      return api.patch<CompanyProfile>('/companies/me', payload);
    },
    onMutate: () => {
      setStatusMessage(null);
      setErrorMessage(null);
    },
    onSuccess: (profile) => {
      queryClient.setQueryData(companyKey, profile);
      void refetchUser();
      setStatusMessage('Organization profile settings saved.');
      setErrorMessage(null);
    },
    onError: (error) => {
      setErrorMessage(error.message || 'Failed to update company settings.');
    },
  });

  // Leave Types Settings
  const { data: leaveTypes = [] } = useQuery({
    queryKey: ['leave-types'],
    queryFn: () => api.get<any[]>('/leave/types'),
    enabled: canManageLeave,
  });

  const updateLeaveTypeMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      api.patch(`/leave/types/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-types'] });
      setStatusMessage('Leave policy configuration updated.');
      setErrorMessage(null);
    },
    onError: (err: any) => {
      setErrorMessage(err.message || 'Failed to update leave policy.');
    },
  });

  const updateLocationConsent = useMutation({
    mutationFn: (locationConsent: boolean) =>
      api.patch<{ locationConsent: boolean }>('/auth/me/location-consent', { locationConsent }),
    onMutate: () => queryClient.cancelQueries({ queryKey: ['auth', 'me'] }),
    onSuccess: ({ locationConsent }) => {
      queryClient.setQueryData<UserProfile>(['auth', 'me'], (current) => current?.employee
        ? {
            ...current,
            employee: { ...current.employee, locationConsent },
            ...(!locationConsent ? { lastLoginLatitude: null, lastLoginLongitude: null, lastLoginLocationAccuracy: null, lastLoginLocationCapturedAt: null } : {}),
          }
        : current);
      void queryClient.invalidateQueries({ queryKey: ['employee'] });
      setStatusMessage('Attendance location preference saved.');
      setErrorMessage(null);
    },
    onError: (error) => {
      setStatusMessage(null);
      setErrorMessage(error.message || 'Failed to save attendance location preference.');
    },
  });

  const resetOperationManagerMutation = useMutation({
    gcTime: 0,
    mutationFn: () => api.post<{
      email: string;
      temporaryPassword: string;
      twoFactorEnabled: boolean;
      message: string;
    }>('/super-admin/platform-accounts/operation-manager/reset-password', {}),
    onMutate: () => {
      setOperationManagerTempPassword(null);
      setOperationManagerPasswordCopied(false);
      setOperationManagerTwoFactorEnabled(false);
      setStatusMessage(null);
      setErrorMessage(null);
    },
    onSuccess: ({ temporaryPassword, twoFactorEnabled }) => {
      setOperationManagerTempPassword(temporaryPassword);
      setOperationManagerTwoFactorEnabled(twoFactorEnabled);
      setStatusMessage('Operation Manager access reset. Copy the temporary password now; it is shown only once.');
      setErrorMessage(null);
    },
    onError: (error: Error) => {
      setStatusMessage(null);
      setErrorMessage(error.message || 'Failed to reset Operation Manager access.');
    },
  });

  // 2FA Setup State
  const [qrData, setQrData] = useState<{ secret: string; qrCodeDataUrl: string } | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [disablePassword, setDisablePassword] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);

  const generate2faMutation = useMutation({
    gcTime: 0,
    mutationFn: () => api.post<{ secret: string; qrCodeDataUrl: string }>('/auth/2fa/generate'),
    onSuccess: (data) => {
      setQrData(data);
      setStatusMessage(null);
      setErrorMessage(null);
    },
    onError: (err: any) => setErrorMessage(err.message || 'Failed to generate 2FA secret.'),
  });

  const enable2faMutation = useMutation({
    gcTime: 0,
    mutationFn: () => api.post<{ backupCodes: string[] }>('/auth/2fa/enable', { code: totpCode }),
    onSuccess: async ({ backupCodes: issuedCodes }) => {
      setBackupCodes(issuedCodes);
      setQrData(null);
      setTotpCode('');
      generate2faMutation.reset();
      setStatusMessage('Two-Factor Authentication (2FA) is now active on your account.');
      setErrorMessage(null);
      await refetchUser();
    },
    onError: (err: any) => setErrorMessage(err.message || 'Invalid verification code.'),
  });

  const disable2faMutation = useMutation({
    mutationFn: () => api.post('/auth/2fa/disable', { password: disablePassword }),
    onSuccess: () => {
      setDisablePassword('');
      refetchUser();
      setStatusMessage('Two-Factor Authentication has been disabled.');
      setErrorMessage(null);
    },
    onError: (err: any) => setErrorMessage(err.message || 'Failed to disable 2FA.'),
  });

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          Platform & Tenant Settings
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Configure organization parameters, leave compliance rules, and account security.
        </p>
      </div>

      {statusMessage && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs font-medium text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-medium text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="border-b border-zinc-200 dark:border-zinc-800">
        <nav className="-mb-px flex space-x-8">
          {isPlatformRole && (
            <button
              onClick={() => setActiveTab('platform')}
              className={`flex items-center gap-2 border-b-2 py-3.5 px-1 text-xs font-semibold uppercase tracking-wider ${
                activeTab === 'platform'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-zinc-500 hover:text-zinc-700'
              }`}
            >
              <Building2 className="h-4 w-4" />
              Platform Governance
            </button>
          )}
          {canManageCompany && (
              <button
                onClick={() => setActiveTab('company')}
                className={`flex items-center gap-2 border-b-2 py-3.5 px-1 text-xs font-semibold uppercase tracking-wider ${
                  activeTab === 'company'
                    ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-zinc-500 hover:text-zinc-700'
                }`}
              >
                <Building2 className="h-4 w-4" />
                Organization Profile
              </button>
          )}
          {canManageLeave && (
              <button
                onClick={() => setActiveTab('leave')}
                className={`flex items-center gap-2 border-b-2 py-3.5 px-1 text-xs font-semibold uppercase tracking-wider ${
                  activeTab === 'leave'
                    ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-zinc-500 hover:text-zinc-700'
                }`}
              >
                <CalendarDays className="h-4 w-4" />
                Company Policies
              </button>
          )}
          <button
            onClick={() => setActiveTab('security')}
            className={`flex items-center gap-2 border-b-2 py-3.5 px-1 text-xs font-semibold uppercase tracking-wider ${
              activeTab === 'security'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-700'
            }`}
          >
            <ShieldCheck className="h-4 w-4" />
            Security & 2FA
          </button>
        </nav>
      </div>

      {/* Tab 0: Platform Governance (Super Admin & Operation Manager) */}
      {activeTab === 'platform' && isPlatformRole && (
        <>
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 space-y-4">
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
            ZenHR SaaS Platform Governance & Policies
          </h2>
          <p className="text-xs text-zinc-500">
            Global operational policies enforced across all client tenants and subscription tiers.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Support Mode Session Duration (Hours)
              </label>
              <input
                type="number"
                min={1}
                max={8}
                value={supportDurationHours}
                onChange={(e) => setSupportDurationHours(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Stripe Dunning Grace Period (Days)
              </label>
              <input
                type="number"
                min={1}
                max={14}
                value={dunningRetryDays}
                onChange={(e) => setDunningRetryDays(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Account Lockout Threshold (Failed Logins)
              </label>
              <input
                type="number"
                min={3}
                max={10}
                value={maxLoginAttempts}
                onChange={(e) => setMaxLoginAttempts(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Default Tenant Probation Period (Months)
              </label>
              <input
                type="number"
                min={1}
                max={12}
                value={defaultProbationMonths}
                onChange={(e) => setDefaultProbationMonths(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>
          </div>
          <div className="pt-3 flex justify-end">
            <button
              onClick={() => {
                setStatusMessage('Platform governance policies saved and synchronized.');
                setErrorMessage(null);
              }}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
            >
              Save Platform Settings
            </button>
          </div>
        </div>
        {user?.role === 'SUPER_ADMIN' && !user.supportModeCompanyId && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm dark:border-amber-900 dark:bg-amber-950/20 space-y-4">
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                Operation Manager Account Recovery
              </h2>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                Reset access for ops@zenhr.com. The generated temporary password appears once, and existing Operation Manager sessions are revoked.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Reset the Operation Manager password and revoke all of its current sessions?')) {
                  resetOperationManagerMutation.mutate();
                }
              }}
              disabled={resetOperationManagerMutation.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-700 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-amber-600 dark:hover:bg-amber-500"
            >
              <KeyRound className="h-4 w-4" />
              {resetOperationManagerMutation.isPending ? 'Resetting access…' : 'Reset Operation Manager Access'}
            </button>
            {operationManagerTempPassword && (
              <div aria-live="polite" className="rounded-xl border border-amber-300 bg-white p-4 dark:border-amber-800 dark:bg-zinc-900">
                <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Temporary password for ops@zenhr.com</p>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <code className="min-w-0 flex-1 select-all break-all rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
                    {operationManagerTempPassword}
                  </code>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(operationManagerTempPassword);
                        setOperationManagerPasswordCopied(true);
                      } catch {
                        setErrorMessage('Clipboard access failed. Select and copy the temporary password manually.');
                      }
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    <Copy className="h-4 w-4" />
                    {operationManagerPasswordCopied ? 'Copied' : 'Copy password'}
                  </button>
                </div>
                <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">
                  Save it securely and use it to sign in as ops@zenhr.com. This value is shown once; another reset replaces it. Leaving this page clears the displayed value.
                </p>
                {operationManagerTwoFactorEnabled && (
                  <p className="mt-2 text-xs font-semibold text-amber-800 dark:text-amber-300">
                    Two-step verification remains enabled. The Operation Manager will still need its authenticator code or a recovery code.
                  </p>
                )}
              </div>
            )}
          </section>
        )}
        </>
      )}

      {/* Tab 1: Organization Profile */}
      {activeTab === 'company' && canManageCompany && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 space-y-4">
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
            Tenant Organization Details
          </h2>
          {!companyData && (companyLoadFailed ? (
            <div className="text-sm text-rose-700 dark:text-rose-300">
              <p role="alert">The organization profile couldn&apos;t load.</p>
              <button type="button" onClick={() => void refetchCompany()} className="mt-2 font-semibold underline" disabled={isLoadingCompany}>Retry organization profile</button>
            </div>
          ) : (
            <p role="status" className="text-sm text-zinc-500">Loading organization profile…</p>
          ))}
          <fieldset disabled={!companyData || updateCompanyMutation.isPending} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="organization-name" className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Organization Name
              </label>
              <input
                id="organization-name"
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>
            <div>
              <label htmlFor="organization-phone" className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Phone Number
              </label>
              <input
                id="organization-phone"
                type="text"
                value={companyPhone}
                onChange={(e) => setCompanyPhone(e.target.value)}
                placeholder="+1 (555) 019-2834"
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>
            <div>
              <label htmlFor="organization-website" className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Website URL
              </label>
              <input
                id="organization-website"
                type="text"
                value={companyWebsite}
                onChange={(e) => setCompanyWebsite(e.target.value)}
                placeholder="https://acme.com"
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>
            <div>
              <label htmlFor="organization-industry" className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Industry Sector
              </label>
              <input
                id="organization-industry"
                type="text"
                value={companyIndustry}
                onChange={(e) => setCompanyIndustry(e.target.value)}
                placeholder="Technology & SaaS"
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="organization-address" className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Headquarters Address
              </label>
              <input
                id="organization-address"
                type="text"
                value={companyAddress}
                onChange={(e) => setCompanyAddress(e.target.value)}
                placeholder="100 Enterprise Way, Suite 400, San Francisco, CA"
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>
            <div>
              <label htmlFor="organization-size" className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Organization Size
              </label>
              <input
                id="organization-size"
                type="text"
                value={companySize}
                onChange={(e) => setCompanySize(e.target.value)}
                placeholder="11-50 Employees"
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>
            <div>
              <label htmlFor="organization-timezone" className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Default Timezone
              </label>
              <input
                id="organization-timezone"
                type="text"
                value={companyTimezone}
                onChange={(e) => setCompanyTimezone(e.target.value)}
                placeholder="UTC"
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>
          </fieldset>
          <div className="pt-3 flex justify-end">
            <button
              onClick={() => updateCompanyMutation.mutate()}
              disabled={!companyData || updateCompanyMutation.isPending}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {updateCompanyMutation.isPending ? 'Saving...' : 'Save Organization Settings'}
            </button>
          </div>
        </div>
      )}

      {/* Tab 2: Leave Policies */}
      {activeTab === 'leave' && canManageLeave && (
        <div className="space-y-4">
          <ShiftPolicies canEdit tenantId={user.companyId!} />
          <Link href="/dashboard/payroll#salary-structures" className="inline-block text-sm font-semibold text-indigo-700 underline dark:text-indigo-300">
            Manage payroll policies and salary structures
          </Link>
        </div>
      )}
      {activeTab === 'leave' && canManageLeave && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 space-y-4">
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
            Company Leave Quotas & Compliance Rules
          </h2>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {leaveTypes.map((lt: any) => (
              <div key={lt.id} className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                    {lt.leaveType} LEAVE
                  </h3>
                  <p className="text-xs text-zinc-500">
                    Annual allocation: {lt.annualAllocation} days •{' '}
                    {lt.requiresMedicalCert ? 'Medical prescription mandatory' : 'Standard workflow'}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={lt.requiresReason}
                      onChange={(e) =>
                        updateLeaveTypeMutation.mutate({
                          id: lt.id,
                          data: { requiresReason: e.target.checked },
                        })
                      }
                      className="rounded border-zinc-300"
                    />
                    <span>Require Reason</span>
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={lt.requiresMedicalCert}
                      onChange={(e) =>
                        updateLeaveTypeMutation.mutate({
                          id: lt.id,
                          data: { requiresMedicalCert: e.target.checked },
                        })
                      }
                      className="rounded border-zinc-300"
                    />
                    <span>Require Medical Cert</span>
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: Security & 2FA */}
      {activeTab === 'security' && user?.companyId && user.employee && (
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Attendance Privacy</h2>
          <label className="mt-3 flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-indigo-600"
              checked={updateLocationConsent.isPending
                ? Boolean(updateLocationConsent.variables)
                : Boolean(user.employee.locationConsent)}
              disabled={updateLocationConsent.isPending}
              onChange={(event) => updateLocationConsent.mutate(event.target.checked)}
              aria-labelledby="attendance-location-label"
              aria-describedby="attendance-location-help"
            />
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              <span id="attendance-location-label">Allow device location at check-in</span>
              <span id="attendance-location-help" className="mt-1 block text-xs font-normal text-zinc-500">
                Share your device location when you sign in or punch in for security telemetry and attendance. Turning this off clears saved browser login coordinates.
              </span>
            </span>
          </label>
        </section>
      )}
      {activeTab === 'security' && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Lock className="h-4 w-4 text-indigo-600" />
                Two-Factor Authentication (TOTP)
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Protect your account with an Authenticator app (Google Authenticator, Authy, 1Password).
              </p>
            </div>
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                user?.twoFaEnabled
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                  : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
              }`}
            >
              {user?.twoFaEnabled ? 'ENABLED' : 'DISABLED'}
            </span>
          </div>

          {backupCodes.length > 0 ? (
            <section aria-labelledby="backup-codes-heading" className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800 space-y-3">
              <h3 id="backup-codes-heading" className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                Save your backup codes
              </h3>
              <p className="text-xs text-zinc-600 dark:text-zinc-300">
                Keep these codes somewhere secure. Each code can sign you in once if you lose access to your authenticator.
                This is the only time they are shown.
              </p>
              <ul className="grid grid-cols-2 gap-2 max-w-xs">
                {backupCodes.map((code) => (
                  <li key={code}>
                    <code className="block rounded bg-zinc-100 px-3 py-1.5 text-xs text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
                      {code}
                    </code>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                disabled={enable2faMutation.isPending}
                onClick={() => {
                  setBackupCodes([]);
                  enable2faMutation.reset();
                }}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                Done
              </button>
            </section>
          ) : !user?.twoFaEnabled ? (
            <div className="pt-2 space-y-4">
              {!qrData ? (
                <button
                  onClick={() => generate2faMutation.mutate()}
                  disabled={generate2faMutation.isPending}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  {generate2faMutation.isPending ? 'Generating...' : 'Configure Two-Factor Authentication'}
                </button>
              ) : (
                <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800 space-y-4">
                  <p className="text-xs text-zinc-600 dark:text-zinc-300">
                    1. Scan the QR code below with your Authenticator app, or manually enter secret key:{' '}
                    <code className="font-mono font-bold text-indigo-600">{qrData.secret}</code>
                  </p>
                  {qrData.qrCodeDataUrl && (
                    <img
                      src={qrData.qrCodeDataUrl}
                      alt="2FA QR Code"
                      className="h-44 w-44 rounded-lg border border-zinc-200 bg-white p-2"
                    />
                  )}
                  <div className="max-w-xs space-y-2">
                    <label htmlFor="totp-setup-code" className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      2. Enter the current 6-digit code from your authenticator app
                    </label>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      The code changes about every 30 seconds. Do not enter the QR secret or the example digits.
                    </p>
                    <div className="flex gap-2">
                      <input
                        id="totp-setup-code"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        value={totpCode}
                        onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                        placeholder="6-digit code"
                        className="w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-mono dark:border-zinc-700 dark:bg-zinc-800"
                      />
                      <button
                        onClick={() => enable2faMutation.mutate()}
                        disabled={totpCode.length < 6 || enable2faMutation.isPending}
                        className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                      >
                        Enable
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="pt-2 max-w-sm space-y-3">
              <label htmlFor="totp-disable-password" className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Confirm your password to disable 2FA
              </label>
              <div className="flex gap-2">
                <PasswordInput
                  id="totp-disable-password"
                  autoComplete="current-password"
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                  placeholder="Current password"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                />
                <button
                  onClick={() => disable2faMutation.mutate()}
                  disabled={!disablePassword || disable2faMutation.isPending}
                  className="rounded-lg bg-rose-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-50 whitespace-nowrap"
                >
                  Disable 2FA
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
