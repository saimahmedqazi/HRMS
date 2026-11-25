'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, API_PREFIX } from '@/lib/api';
import { StatusBadge } from '@/components/ui/status-badge';
import { ContextualHelpTip } from '@/components/help/contextual-help-tip';
import {
  Calendar,
  AlertTriangle,
  Clock,
  CheckCircle,
  XCircle,
  FileText,
  UploadCloud,
  Plus,
  Info,
  ShieldAlert,
} from 'lucide-react';

interface LeaveTypeSetting {
  id: string;
  leaveType: string;
  annualAllocation: number;
  isActive: boolean;
  requiresReason: boolean;
  requiresMedicalCert: boolean;
  isPaid?: boolean;
  enforceEntitlement?: boolean;
  allowDuringProbation?: boolean;
  maxConsecutiveDays?: number | null;
}

export default function LeaveDashboardPage() {
  const queryClient = useQueryClient();
  const [balanceYear, setBalanceYear] = useState(new Date().getFullYear());
  const [mode, setMode] = useState<'regular' | 'additional' | 'retrospective'>('regular');
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedSettingId, setSelectedSettingId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [attachment, setAttachment] = useState<{ settingId: string; file: File } | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [targetRequestId, setTargetRequestId] = useState<string | null>(null);
  const [missingTargetNotice, setMissingTargetNotice] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const reqId = new URLSearchParams(window.location.search).get('requestId');
    setTargetRequestId(reqId);
    setMissingTargetNotice(false);
  }, []);

  // 1. Fetch current user & profile
  const { data: user } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<any>('/auth/me'),
  });
  const isCompanyReviewer = user?.role === 'COMPANY_ADMIN' || user?.role === 'HR_MANAGER';

  // 2. Fetch leave types
  const { data: leaveTypes = [], isError: leaveTypesFailed, isSuccess: leaveTypesLoaded } = useQuery({
    queryKey: ['leave-types'],
    queryFn: () => api.get<LeaveTypeSetting[]>('/leave/types'),
    select: (settings) => settings.filter((setting) => setting.isActive),
  });

  const absences = useQuery({
    queryKey: ['eligible-absence-dates', user?.id, user?.companyId],
    queryFn: () => api.get<{ dates: string[]; regularizationEnabled: boolean;
      regularizationDocument: boolean; regularizationExceptional: boolean; regularizationLookback: number }>('/leave/regularization/eligible'),
    enabled: Boolean(user?.employee?.id),
  });

  // 3. Fetch balances
  const { data: balances = [], isLoading: loadingBalances, isError: balancesFailed } = useQuery({
    queryKey: ['leave-balances', balanceYear],
    queryFn: () => api.get<any[]>(`/leave/balances?year=${balanceYear}`),
  });

  // 4. Fetch leave requests
  const { data: leaveRequests = [], isLoading: loadingRequests } = useQuery({
    queryKey: ['leave-requests'],
    queryFn: () => api.get<any[]>('/leave/requests'),
  });

  useEffect(() => {
    if (!targetRequestId || loadingRequests) return;
    const match = leaveRequests.find((r: any) => r.id === targetRequestId);
    if (!match) {
      setMissingTargetNotice(true);
    } else {
      setMissingTargetNotice(false);
    }
  }, [targetRequestId, loadingRequests, leaveRequests]);

  // Probation check: EMPLOYEE role on ON_PROBATION within 90 days of hire
  const employee = user?.employee;
  let isUnderProbation = false;
  let probationDaysRemaining = 0;
  let probationEndFormatted = '';

  if (employee?.status === 'ON_PROBATION' && (employee?.probationEndDate || employee?.hireDate)) {
    const probationEnd = employee.probationEndDate
      ? new Date(employee.probationEndDate)
      : new Date(new Date(employee.hireDate).getTime() + 90 * 24 * 60 * 60 * 1000);
    const now = new Date();
    if (now < probationEnd) {
      isUnderProbation = true;
      probationDaysRemaining = Math.ceil(
        (probationEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );
      probationEndFormatted = probationEnd.toLocaleDateString('en-US', {
        timeZone: 'UTC',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    }
  }

  // Selected leave type setting
  const regularTypes = leaveTypes.filter((item) => item.leaveType !== 'SPECIAL' && item.leaveType !== 'UNPAID');
  const additionalTypes = leaveTypes.filter((item) => (item.leaveType === 'SPECIAL' || item.leaveType === 'UNPAID')
    && (!isUnderProbation || item.allowDuringProbation));
  const options = mode === 'additional' ? additionalTypes : mode === 'retrospective'
    ? [...(user?.role !== 'EMPLOYEE' || !isUnderProbation ? regularTypes : []), ...(absences.data?.regularizationExceptional ? additionalTypes : [])]
    : regularTypes;
  const activeSetting = options.find((item) => item.id === selectedSettingId) ?? options[0];
  const requiresDocument = Boolean(activeSetting?.requiresMedicalCert || (mode === 'retrospective' && absences.data?.regularizationDocument));
  const showMedicalUpload = activeSetting?.leaveType === 'SICK' || requiresDocument;
  const file = attachment && attachment.settingId === activeSetting?.id ? attachment.file : null;
  const canUseRegular = user?.role !== 'EMPLOYEE' || !isUnderProbation;
  const canRequestLeave = canUseRegular && regularTypes.length > 0;
  const eligibleDates = absences.data?.dates ?? [];
  const contiguousEndDates = eligibleDates.filter((date, index) => {
    const startIndex = eligibleDates.indexOf(startDate);
    return startIndex >= 0 && index >= startIndex && (Date.parse(date) - Date.parse(startDate)) / 86400000 === index - startIndex;
  });
  function openRequest(nextMode: typeof mode) {
    setMode(nextMode);
    setStartDate('');
    setEndDate('');
    setSelectedSettingId('');
    setAttachment(null);
    setReason('');
    setErrorMessage('');
    setModalOpen(true);
  }
  React.useEffect(() => {
    if (new URLSearchParams(window.location.search).get('regularize') === '1') {
      setMode('retrospective');
      setModalOpen(true);
    }
  }, []);

  // Calculate day count
  const calculateDays = () => {
    if (!startDate || !endDate) return 0;
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end < start) return 0;
    return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  };
  const totalDays = calculateDays();
  const requestedYears = [...new Set([startDate, endDate].filter(Boolean).map((value) => Number(value.slice(0, 4))))];
  const requestEntitlement = useQuery({
    queryKey: ['leave-balances', 'request', user?.id, user?.companyId, requestedYears],
    enabled: modalOpen && mode !== 'regular' && Boolean(activeSetting && activeSetting.enforceEntitlement !== false) && requestedYears.length > 0,
    queryFn: async () => (await Promise.all(requestedYears.map((year) => api.get<{
      year: number; leaveType: string; initialized: boolean; available?: number;
    }[]>(`/leave/balances?year=${year}`)))).flat(),
  });


  // Create Leave Request Mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!activeSetting || !startDate || !endDate) throw new Error('Please fill all required fields');
      if (requiresDocument && !file) {
        throw new Error('Upload a supporting document for this request.');
      }

      if (mode !== 'regular' && reason.trim().length < 3) throw new Error('Enter a meaningful explanation.');
      if (mode === 'retrospective' && !contiguousEndDates.includes(endDate)) throw new Error('Select consecutive eligible absence dates.');
      const formData = new FormData();
      if (mode === 'retrospective') formData.append('mode', 'RETROSPECTIVE');
      formData.append('leaveTypeSettingId', activeSetting.id);
      formData.append('startDate', startDate);
      formData.append('endDate', endDate);
      if (reason) formData.append('reason', reason);
      if (showMedicalUpload && file) formData.append('prescription', file);

      return api.post('/leave/requests', formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-requests'] });
      queryClient.invalidateQueries({ queryKey: ['eligible-absence-dates'] });
      queryClient.invalidateQueries({ queryKey: ['leave-balances'] });
      setModalOpen(false);
      setSelectedSettingId('');
      setStartDate('');
      setEndDate('');
      setReason('');
      setAttachment(null);
      setErrorMessage('');
    },
    onError: (err: any) => {
      setErrorMessage(err.message || 'Failed to submit leave request');
    },
  });

  // Cancel Leave Request Mutation
  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.post(`/leave/requests/${id}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-requests'] });
      queryClient.invalidateQueries({ queryKey: ['eligible-absence-dates'] });
      queryClient.invalidateQueries({ queryKey: ['leave-balances'] });
    },
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Leave Management
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            View annual balances, check request workflows, and request time off.
          </p>
        </div>

        <div>
          <button
            onClick={() => {
              if (!canRequestLeave) return;
              openRequest('regular');
            }}
            disabled={!canRequestLeave}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg shadow-sm transition-colors ${
              canRequestLeave
                ? 'bg-primary-600 hover:bg-primary-700 text-white'
                : 'bg-gray-300 dark:bg-gray-800 text-gray-500 cursor-not-allowed'
            }`}
          >
            <Plus className="w-4 h-4" />
            Request Leave
          </button>
          {additionalTypes.length > 0 ? (
            <button type="button" onClick={() => openRequest('additional')} className="text-sm font-semibold text-primary-600">Request additional leave</button>
          ) : leaveTypesLoaded && <p className="text-xs text-gray-500">Additional leave is unavailable under your company policy or eligibility.</p>}
          {user?.employee?.id && <button type="button" onClick={() => openRequest('retrospective')}
            className="text-sm font-semibold text-primary-600">Regularize absence</button>}
          {leaveTypes.length === 0 && (leaveTypesLoaded || leaveTypesFailed) && (
            <p role="status" className="mt-2 text-xs text-gray-600 dark:text-gray-300">
              {leaveTypesFailed ? 'Leave types could not be loaded.' : 'No leave types are currently available.'}
            </p>
          )}
        </div>
      </div>

      <ContextualHelpTip
        id="leave-guide"
        userId={user?.id}
        title="Leave & Regularization Guide"
        description="Use Request Leave for standard balances. If your balance is exhausted, use Request additional leave (when enabled by company policy). Missed an attendance punch on a finalized absent day? Use Regularize absence; only final approval converts the absence."
      />

      {/* Probation Gating Alert Banner */}
      {isUnderProbation && user?.role === 'EMPLOYEE' && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/80 rounded-xl p-4 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <h3 className="font-semibold text-amber-900 dark:text-amber-200">
              Probation Period Active ({probationDaysRemaining} Days Remaining)
            </h3>
            <p className="text-amber-800 dark:text-amber-300/90 mt-1">
              Regular leave is unavailable until <strong>{probationEndFormatted}</strong>.
              Additional leave may be available under company policy. Contact HR if you need help.
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <label htmlFor="leave-balance-year" className="text-sm font-semibold">Balance year</label>
        <input id="leave-balance-year" type="number" min="1900" max="9999" value={balanceYear}
          onChange={(event) => setBalanceYear(Number(event.target.value))}
          className="w-28 rounded border border-gray-300 bg-white px-2 py-1 dark:border-gray-700 dark:bg-gray-800" />
      </div>
      {balancesFailed && <p role="alert" className="text-sm text-rose-600">Unable to load leave balances.</p>}
      {!loadingBalances && !balancesFailed && balances.length === 0 && <p className="text-sm text-gray-500">No leave balances are configured.</p>}
      {/* Balances Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {balances.map((balance: any) => {
          const isSick = balance.leaveType === 'SICK';
          const isAnnual = balance.leaveType === 'ANNUAL';
          return (
            <div
              key={balance.id}
              className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 shadow-sm"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  {balance.leaveType} LEAVE
                </span>
                <span
                  className={`p-2 rounded-lg text-xs font-medium ${
                    isSick
                      ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400'
                      : isAnnual
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400'
                      : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400'
                  }`}
                >
                  {balance.year} Quota
                </span>
              </div>

              {!balance.initialized ? (
                <p className="text-sm text-gray-500">Balance not initialized for this year.</p>
              ) : <><div className="flex items-baseline gap-2 mb-4">
                <span className="text-3xl font-extrabold text-gray-900 dark:text-white">
                  {balance.available}
                </span>
                <span className="text-sm font-medium text-gray-500">days available</span>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-3 border-t border-gray-100 dark:border-gray-800 text-xs">
                <div>
                  <p className="text-gray-400">Allocated</p>
                  <p className="font-semibold text-gray-700 dark:text-gray-300">
                    {balance.allocated} d
                  </p>
                </div>
                <div>
                  <p className="text-gray-400">Used</p>
                  <p className="font-semibold text-gray-700 dark:text-gray-300">
                    {balance.used} d
                  </p>
                </div>
                <div>
                  <p className="text-gray-400">Pending</p>
                  <p className="font-semibold text-amber-600 dark:text-amber-400">
                    {balance.pending} d
                  </p>
                </div>
              </div></>}
            </div>
          );
        })}
      </div>

      {/* Leave Requests Table */}
      {missingTargetNotice && (
        <div role="status" className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          <span>The referenced leave request could not be found or is no longer accessible.</span>
          <button type="button" onClick={() => setMissingTargetNotice(false)} className="font-semibold underline">
            Dismiss
          </button>
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            {isCompanyReviewer ? 'Company Leave Requests' : 'My Leave Requests'}
          </h2>
          <span className="text-xs text-gray-500">
            {leaveRequests.length} record(s) found
          </span>
        </div>

        {leaveRequests.length === 0 ? (
          <div className="p-12 text-center">
            <Calendar className="w-10 h-10 text-gray-400 mx-auto mb-3 opacity-60" />
            <h3 className="text-sm font-medium text-gray-900 dark:text-white">
              {isCompanyReviewer ? 'No company leave requests yet' : 'No leave requests submitted yet'}
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              {isCompanyReviewer
                ? 'Employee leave requests will appear here when submitted.'
                : 'Your historical and pending time-off requests will appear here.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800/50 text-xs text-gray-500 uppercase">
                <tr>
                  {isCompanyReviewer && <th className="px-4 py-3">Employee</th>}
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Dates</th>
                  <th className="px-4 py-3">Days</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Prescription</th>
                  <th className="px-4 py-3">Step 1</th>
                  <th className="px-4 py-3">Step 2</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {leaveRequests.map((req: any) => {
                  const isApplicant = req.employee?.userId === user?.id;
                  const isHighlighted = targetRequestId === req.id;
                  return (
                    <tr
                      key={req.id}
                      className={`hover:bg-gray-50/50 dark:hover:bg-gray-800/30 ${
                        isHighlighted ? 'bg-indigo-50/70 ring-1 ring-inset ring-indigo-500 dark:bg-indigo-950/40' : ''
                      }`}
                    >
                      {isCompanyReviewer && (
                        <td className="px-4 py-3">
                          <div className="font-semibold text-gray-900 dark:text-white">
                            {req.employee?.firstName} {req.employee?.lastName}
                          </div>
                          <div className="text-xs text-gray-400">
                            {req.employee?.user?.email || req.employee?.employeeCode}
                          </div>
                        </td>
                      )}
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                        {req.leaveTypeSetting?.leaveType}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                        {new Date(req.startDate).toLocaleDateString()} &rarr;{' '}
                        {new Date(req.endDate).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">
                        {req.totalDays}
                        <details className="mt-2 text-xs font-normal">
                          <summary className="cursor-pointer text-primary-600">Request details</summary>
                          <div className="mt-2 min-w-48 max-w-xs space-y-3 whitespace-normal text-gray-700 dark:text-gray-300">
                            <div>
                              <p className="font-semibold">Yearly allocation</p>
                              {req.retrospective && <p>Retrospective leave</p>}
                              {req.policySnapshot && <p>{req.policySnapshot.isPaid ? 'Paid leave' : 'Unpaid leave'} · {req.policySnapshot.enforceEntitlement ? 'Uses leave entitlement' : 'No entitlement deduction'}</p>}
                              {req.policySnapshot?.enforceEntitlement === false && req.approvedDaysByYear?.map((item: { year: number; days: number }) => <p key={item.year}>{item.year}: {item.days} days approved</p>)}
                              {req.approvedStart && <p>Approved {req.approvedStart.slice(0, 10)} to {req.approvedEnd.slice(0, 10)} · {req.approvedDays} of {req.totalDays} days · {req.totalDays - req.approvedDays} unapproved</p>}
                              {Array.isArray(req.balanceDaysByYear) ? req.balanceDaysByYear.map((item: { year: number; days: number }) => (
                                <p key={item.year}>{item.year}: {item.days} days {req.policySnapshot?.enforceEntitlement === false ? 'requested' : req.approvedDaysByYear ? 'originally reserved' : req.status === 'PENDING' ? 'reserved' : req.status === 'APPROVED' ? 'used' : 'released'}
                                  {req.policySnapshot?.enforceEntitlement !== false && req.approvedDaysByYear && ` · ${req.approvedDaysByYear.find((entry: { year: number; days: number }) => entry.year === item.year)?.days ?? 0} used · ${Math.max(0, item.days - (req.approvedDaysByYear.find((entry: { year: number; days: number }) => entry.year === item.year)?.days ?? 0))} released`}</p>
                              )) : <><p>Historical breakdown unavailable.</p>
                                {req.approvedDaysByYear?.map((entry: { year: number; days: number }) => <p key={entry.year}>{entry.year}: {entry.days} days used</p>)}</>}
                            </div>
                            {[1, 2].map((step) => {
                              const status = req[`step${step}Status`];
                              const pending = status === 'PENDING' && req.status === 'PENDING';
                              const notReached = status === 'PENDING' && req.status !== 'PENDING';
                              const actor = req[`step${step}ActorName`];
                              const role = req[`step${step}ActorRole`];
                              const assigned = req[`step${step}AssignedReviewer`];
                              const at = req[`step${step}ApprovedAt`];
                              return <div key={step}>
                                <p className="font-semibold">Step {step}: {notReached ? 'Not reached' : status === 'SKIPPED' ? 'Skipped' : req[`step${step}PartialReason`] ? 'Partially approved' : status}</p>
                                {pending && <p>Assigned reviewer: {assigned ? `${assigned.name} (${assigned.role.replace(/_/g, ' ')})` : 'Not assigned'}</p>}
                                {(status === 'APPROVED' || status === 'REJECTED') && <p>Reviewer: {actor ? `${actor} (${(role || '').replace(/_/g, ' ')})` : 'Reviewer not recorded'}</p>}
                                {at && <p>{new Date(at).toLocaleString()}</p>}
                                {at && (actor || req.step1ApprovedStart || req.approvedStart) &&
                                  <p>Reviewed {(step === 2 ? req.step1ApprovedStart ?? req.startDate : req.startDate).slice(0, 10)} to {(step === 2 ? req.step1ApprovedEnd ?? req.endDate : req.endDate).slice(0, 10)}</p>}
                                {status === 'APPROVED' && (step === 1 ? req.step1ApprovedStart : req.approvedStart) &&
                                  <p>Approved {(step === 1 ? req.step1ApprovedStart : req.approvedStart).slice(0, 10)} to {(step === 1 ? req.step1ApprovedEnd : req.approvedEnd).slice(0, 10)}</p>}
                                {req[`step${step}PartialReason`] && <p>Reason: {req[`step${step}PartialReason`]}</p>}
                                {status === 'REJECTED' && req[`step${step}Notes`] && <p>Reason: {req[`step${step}Notes`]}</p>}
                              </div>;
                            })}
                          </div>
                        </details>
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-xs truncate">
                        {req.reason || '—'}
                      </td>
                      <td className="px-4 py-3">
                        {req.medicalCertUrl ? (
                          <a
                            href={`${API_PREFIX}/leave/requests/${req.id}/prescription/download`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary-600 hover:underline"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            View
                          </a>
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={req.step1Status === 'PENDING' && req.status !== 'PENDING' ? 'Not reached' : req.step1Status} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={req.step2Status === 'PENDING' && req.status !== 'PENDING' ? 'Not reached' : req.step2Status} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={req.status === 'APPROVED' && req.approvedDays != null && req.approvedDays < req.totalDays ? 'Partially approved' : req.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        {req.status === 'PENDING' && isApplicant ? (
                          <button
                            onClick={() => cancelMutation.mutate(req.id)}
                            disabled={cancelMutation.isPending}
                            className="text-xs text-rose-600 hover:text-rose-700 font-medium"
                          >
                            Cancel
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Request Leave Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-labelledby="leave-request-title" className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-2xl max-w-lg w-full max-h-[90dvh] overflow-y-auto p-6">
            <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-800">
              <h3 id="leave-request-title" className="text-lg font-bold text-gray-900 dark:text-white">
                {mode === 'retrospective' ? 'Regularize absence' : mode === 'additional' ? 'Request additional leave' : 'Request Leave'}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                disabled={createMutation.isPending}
                aria-label="Close leave request"
                className="text-gray-400 hover:text-gray-600 text-lg leading-none"
              >
                &times;
              </button>
            </div>

            {errorMessage && (
              <div role="alert" className="mt-4 p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 rounded-lg text-xs text-rose-700 dark:text-rose-300">
                {errorMessage}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setErrorMessage('');
                createMutation.mutate();
              }}
              className="mt-4 space-y-4 text-sm"
            >
              <div>
                <label htmlFor="leave-request-type" className="block text-xs font-semibold uppercase text-gray-500 mb-1">
                  Leave Type
                </label>
                <select
                  id="leave-request-type"
                  value={activeSetting?.id ?? ''}
                  onChange={(e) => {
                    setSelectedSettingId(e.target.value);
                    setAttachment(null);
                    setErrorMessage('');
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
                  required
                >
                  {options.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.leaveType} ({t.isPaid === false ? 'unpaid' : 'paid'} · {t.enforceEntitlement === false ? 'no entitlement deduction' : `${t.annualAllocation} days/year`})
                    </option>
                  ))}
                </select>
              </div>

              {mode !== 'regular' && <p className="text-xs text-gray-600 dark:text-gray-400">
                A request requires review before it takes effect. {mode === 'additional' && 'Consider this option if your regular entitlement is insufficient.'}
              </p>}
              {mode !== 'regular' && activeSetting?.enforceEntitlement !== false && requestEntitlement.isFetching &&
                <p role="status" className="text-xs">Checking annual entitlement…</p>}
              {mode !== 'regular' && requestEntitlement.data?.filter((balance) => balance.leaveType === activeSetting?.leaveType).map((balance) =>
                <p key={balance.year} className="text-xs">{balance.year}: {balance.initialized ? `${balance.available} days available` : 'Balance not initialized'}</p>)}
              {activeSetting?.maxConsecutiveDays && <p className="text-xs">Maximum {activeSetting.maxConsecutiveDays} consecutive days.</p>}
              {mode === 'retrospective' ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {absences.isLoading && <p role="status">Checking eligible absences…</p>}
                  {absences.isError && <p role="alert">Could not load eligible absences.</p>}
                  {absences.data && !absences.data.regularizationEnabled && <p>Retrospective leave is disabled by your company.</p>}
                  {absences.data?.regularizationEnabled && eligibleDates.length === 0 && <p>No eligible absences in the last {absences.data.regularizationLookback} days. Dates with work, without an absence record or in paid payroll periods are excluded.</p>}
                  {eligibleDates.length > 0 && <>
                    <label className="text-xs">First absence date<select className="block w-full rounded border p-2 dark:bg-gray-800" value={startDate} onChange={(event) => { setStartDate(event.target.value); setEndDate(event.target.value); }} required>
                      <option value="">Select a date</option>{eligibleDates.map((date) => <option key={date}>{date}</option>)}
                    </select></label>
                    <label className="text-xs">Last absence date<select className="block w-full rounded border p-2 dark:bg-gray-800" value={endDate} onChange={(event) => setEndDate(event.target.value)} required>
                      <option value="">Select a date</option>{contiguousEndDates.map((date) => <option key={date}>{date}</option>)}
                    </select></label>
                  </>}
                </div>
              ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
                    required
                  />
                </div>
              </div>

              )}
              {totalDays > 0 && (
                <div className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 p-2.5 rounded-lg flex items-center justify-between">
                  <span>Total duration requested:</span>
                  <span className="font-bold text-gray-900 dark:text-white">
                    {totalDays} calendar day(s)
                  </span>
                </div>
              )}

              <div>
                <label htmlFor="leave-request-reason" className="block text-xs font-semibold uppercase text-gray-500 mb-1">
                  Reason {activeSetting?.requiresReason && <span className="text-rose-500">*</span>}
                </label>
                <textarea
                  id="leave-request-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  placeholder="Detail your request justification..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
                  required={activeSetting?.requiresReason || mode !== 'regular'}
                />
              </div>

              {showMedicalUpload && activeSetting && (
                <div>
                  <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
                    Supporting document {requiresDocument
                      ? <span className="text-rose-500">*</span>
                      : <span>(optional)</span>}
                  </label>
                  <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-4 text-center hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                    <input
                      type="file"
                      id="prescription-file"
                      key={activeSetting.id}
                      accept=".pdf,.png,.jpg,.jpeg"
                      onChange={(e) => {
                        const selected = e.target.files?.[0];
                        setAttachment(selected ? { settingId: activeSetting.id, file: selected } : null);
                        setErrorMessage('');
                      }}
                      className="peer sr-only"
                    />
                    <label htmlFor="prescription-file" className="block cursor-pointer rounded peer-focus-visible:ring-2 peer-focus-visible:ring-primary-500">
                      <UploadCloud className="w-8 h-8 text-gray-400 mx-auto mb-1" />
                      {file ? (
                        <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          {file.name} ({(file.size / 1024).toFixed(1)} KB)
                        </p>
                      ) : (
                        <p className="text-xs text-gray-500">
                          Upload a supporting document (PDF, JPG, PNG &le; 10MB)
                        </p>
                      )}
                    </label>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-gray-200 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  disabled={createMutation.isPending}
                  className="px-4 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || !activeSetting || totalDays <= 0 ||
                    (mode === 'retrospective' && !contiguousEndDates.includes(endDate))}
                  className="px-4 py-2 text-xs font-medium bg-primary-600 hover:bg-primary-700 text-white rounded-lg disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Submitting...' : 'Submit Leave Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
