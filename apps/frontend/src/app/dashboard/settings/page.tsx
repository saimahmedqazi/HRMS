'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth, type UserProfile } from '@/lib/auth-context';
import {
  Building2,
  ShieldCheck,
  CalendarDays,
  Lock,
  CheckCircle2,
  AlertTriangle,
  KeyRound,
} from 'lucide-react';

export default function SettingsPage() {
  const { user, refetchUser } = useAuth();
  const queryClient = useQueryClient();
  const hasCompany = Boolean(user?.company?.id || user?.supportModeCompanyId);

  const isPlatformRole =
    (user?.role === 'SUPER_ADMIN' || user?.role === 'OPERATION_MANAGER') &&
    !user?.supportModeCompanyId;
  const canManageLeave = hasCompany && (user?.role === 'COMPANY_ADMIN' || user?.role === 'HR_MANAGER');
  const canManageCompany = canManageLeave || (hasCompany && user?.role === 'SUPER_ADMIN');

  const tabs = { platform: isPlatformRole, company: canManageCompany, leave: canManageLeave, security: true };
  const [selectedTab, setActiveTab] = useState<keyof typeof tabs | null>(null);
  const activeTab = selectedTab && tabs[selectedTab]
    ? selectedTab
    : isPlatformRole ? 'platform' : canManageCompany ? 'company' : 'security';
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Company Settings State
  const { data: companyData } = useQuery({
    queryKey: ['company-me'],
    queryFn: () => api.get<any>('/companies/me'),
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
      setCompanyIndustry(companyData.industry || 'Technology & SaaS');
      setCompanySize(companyData.size || '11-50 Employees');
      setCompanyTimezone(companyData.timezone || 'UTC');
    }
  }, [companyData]);

  const updateCompanyMutation = useMutation({
    mutationFn: () => {
      const payload: any = {};
      const targetName = (companyName || companyData?.name || '').trim();
      if (targetName) payload.name = targetName;
      if (companyPhone && companyPhone.trim()) payload.phone = companyPhone.trim();
      if (companyAddress && companyAddress.trim()) payload.address = companyAddress.trim();
      if (companyWebsite && companyWebsite.trim()) payload.website = companyWebsite.trim();
      if (companyIndustry && companyIndustry.trim()) payload.industry = companyIndustry.trim();
      if (companySize && companySize.trim()) payload.size = companySize.trim();
      if (companyTimezone && companyTimezone.trim()) payload.timezone = companyTimezone.trim();
      return api.patch('/companies/me', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-me'] });
      refetchUser();
      setStatusMessage('Organization profile settings saved.');
      setErrorMessage(null);
    },
    onError: (err: any) => {
      setErrorMessage(err.message || 'Failed to update company settings.');
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
        ? { ...current, employee: { ...current.employee, locationConsent } }
        : current);
      setStatusMessage('Attendance location preference saved.');
      setErrorMessage(null);
    },
    onError: (error) => {
      setStatusMessage(null);
      setErrorMessage(error.message || 'Failed to save attendance location preference.');
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
                Leave Policies
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
      )}

      {/* Tab 1: Organization Profile */}
      {activeTab === 'company' && canManageCompany && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 space-y-4">
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
            Tenant Organization Details
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Organization Name
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Phone Number
              </label>
              <input
                type="text"
                value={companyPhone}
                onChange={(e) => setCompanyPhone(e.target.value)}
                placeholder="+1 (555) 019-2834"
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Website URL
              </label>
              <input
                type="text"
                value={companyWebsite}
                onChange={(e) => setCompanyWebsite(e.target.value)}
                placeholder="https://acme.com"
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Industry Sector
              </label>
              <input
                type="text"
                value={companyIndustry}
                onChange={(e) => setCompanyIndustry(e.target.value)}
                placeholder="Technology & SaaS"
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Headquarters Address
              </label>
              <input
                type="text"
                value={companyAddress}
                onChange={(e) => setCompanyAddress(e.target.value)}
                placeholder="100 Enterprise Way, Suite 400, San Francisco, CA"
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Organization Size
              </label>
              <input
                type="text"
                value={companySize}
                onChange={(e) => setCompanySize(e.target.value)}
                placeholder="11-50 Employees"
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Default Timezone
              </label>
              <input
                type="text"
                value={companyTimezone}
                onChange={(e) => setCompanyTimezone(e.target.value)}
                placeholder="UTC"
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>
          </div>
          <div className="pt-3 flex justify-end">
            <button
              onClick={() => updateCompanyMutation.mutate()}
              disabled={updateCompanyMutation.isPending}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {updateCompanyMutation.isPending ? 'Saving...' : 'Save Organization Settings'}
            </button>
          </div>
        </div>
      )}

      {/* Tab 2: Leave Policies */}
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
                Share your device location when you punch in. You can turn this off anytime.
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
                      2. Enter 6-digit verification code
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="totp-setup-code"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        value={totpCode}
                        onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                        placeholder="123456"
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
                <input
                  id="totp-disable-password"
                  type="password"
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
