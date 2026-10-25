'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/ui/status-badge';
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

export default function LeaveDashboardPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedSettingId, setSelectedSettingId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  // 1. Fetch current user & profile
  const { data: user } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<any>('/auth/me'),
  });

  // 2. Fetch leave types
  const { data: leaveTypes = [], isLoading: loadingTypes } = useQuery({
    queryKey: ['leave-types'],
    queryFn: () => api.get<any[]>('/leave/types'),
  });

  // 3. Fetch balances
  const { data: balances = [], isLoading: loadingBalances } = useQuery({
    queryKey: ['leave-balances'],
    queryFn: () => api.get<any[]>('/leave/balances'),
  });

  // 4. Fetch leave requests
  const { data: leaveRequests = [], isLoading: loadingRequests } = useQuery({
    queryKey: ['leave-requests'],
    queryFn: () => api.get<any[]>('/leave/requests'),
  });

  // Probation check: EMPLOYEE role on ON_PROBATION within 90 days of hire
  const employee = user?.employee;
  let isUnderProbation = false;
  let probationDaysRemaining = 0;
  let probationEndFormatted = '';

  if (user?.role === 'EMPLOYEE' && employee?.status === 'ON_PROBATION' && employee?.hireDate) {
    const hireTime = new Date(employee.hireDate).getTime();
    const probationEnd = new Date(hireTime + 90 * 24 * 60 * 60 * 1000);
    const now = new Date();
    if (now < probationEnd) {
      isUnderProbation = true;
      probationDaysRemaining = Math.ceil(
        (probationEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );
      probationEndFormatted = probationEnd.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    }
  }

  // Selected leave type setting
  const activeSetting = leaveTypes.find((t) => t.id === selectedSettingId);
  const isSickLeave =
    activeSetting?.leaveType === 'SICK' || activeSetting?.requiresMedicalCert;

  // Calculate day count
  const calculateDays = () => {
    if (!startDate || !endDate) return 0;
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end < start) return 0;
    return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  };
  const totalDays = calculateDays();

  // Create Leave Request Mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append('leaveTypeSettingId', selectedSettingId);
      formData.append('startDate', startDate);
      formData.append('endDate', endDate);
      if (reason) formData.append('reason', reason);
      if (file) formData.append('prescription', file);

      return api.post('/leave/requests', formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-requests'] });
      queryClient.invalidateQueries({ queryKey: ['leave-balances'] });
      setModalOpen(false);
      setSelectedSettingId('');
      setStartDate('');
      setEndDate('');
      setReason('');
      setFile(null);
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
              if (isUnderProbation) return;
              if (leaveTypes.length > 0) setSelectedSettingId(leaveTypes[0].id);
              setModalOpen(true);
            }}
            disabled={isUnderProbation}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg shadow-sm transition-colors ${
              isUnderProbation
                ? 'bg-gray-300 dark:bg-gray-800 text-gray-500 cursor-not-allowed'
                : 'bg-primary-600 hover:bg-primary-700 text-white'
            }`}
          >
            <Plus className="w-4 h-4" />
            Request Leave
          </button>
        </div>
      </div>

      {/* Probation Gating Alert Banner */}
      {isUnderProbation && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/80 rounded-xl p-4 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <h3 className="font-semibold text-amber-900 dark:text-amber-200">
              Probation Period Active ({probationDaysRemaining} Days Remaining)
            </h3>
            <p className="text-amber-800 dark:text-amber-300/90 mt-1">
              Per ZenHR company policy, employees on active 3-month probation cannot submit leave
              requests until <strong>{probationEndFormatted}</strong>. For urgent family or medical
              emergencies, please contact HR or your Department Manager directly.
            </p>
          </div>
        </div>
      )}

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

              <div className="flex items-baseline gap-2 mb-4">
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
              </div>
            </div>
          );
        })}
      </div>

      {/* Leave Requests Table */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            My Leave Requests
          </h2>
          <span className="text-xs text-gray-500">
            {leaveRequests.length} record(s) found
          </span>
        </div>

        {leaveRequests.length === 0 ? (
          <div className="p-12 text-center">
            <Calendar className="w-10 h-10 text-gray-400 mx-auto mb-3 opacity-60" />
            <h3 className="text-sm font-medium text-gray-900 dark:text-white">
              No leave requests submitted yet
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Your historical and pending time-off requests will appear here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800/50 text-xs text-gray-500 uppercase">
                <tr>
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
                {leaveRequests.map((req: any) => (
                  <tr key={req.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                      {req.leaveTypeSetting?.leaveType}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                      {new Date(req.startDate).toLocaleDateString()} &rarr;{' '}
                      {new Date(req.endDate).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">
                      {req.totalDays}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-xs truncate">
                      {req.reason || '—'}
                    </td>
                    <td className="px-4 py-3">
                      {req.medicalCertUrl ? (
                        <a
                          href={req.medicalCertUrl}
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
                      <StatusBadge status={req.step1Status} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={req.step2Status} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={req.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {req.status === 'PENDING' ? (
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Request Leave Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-2xl max-w-lg w-full p-6">
            <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-800">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                Request Leave
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none"
              >
                &times;
              </button>
            </div>

            {errorMessage && (
              <div className="mt-4 p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 rounded-lg text-xs text-rose-700 dark:text-rose-300">
                {errorMessage}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate();
              }}
              className="mt-4 space-y-4 text-sm"
            >
              <div>
                <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
                  Leave Type
                </label>
                <select
                  value={selectedSettingId}
                  onChange={(e) => setSelectedSettingId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
                  required
                >
                  {leaveTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.leaveType} ({t.annualAllocation} days/yr)
                    </option>
                  ))}
                </select>
              </div>

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

              {totalDays > 0 && (
                <div className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 p-2.5 rounded-lg flex items-center justify-between">
                  <span>Total duration requested:</span>
                  <span className="font-bold text-gray-900 dark:text-white">
                    {totalDays} calendar day(s)
                  </span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
                  Reason {activeSetting?.requiresReason && <span className="text-rose-500">*</span>}
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  placeholder="Detail your request justification..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
                  required={activeSetting?.requiresReason}
                />
              </div>

              {isSickLeave && (
                <div>
                  <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
                    Medical Prescription / Certificate <span className="text-rose-500">*</span>
                  </label>
                  <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-4 text-center hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                    <input
                      type="file"
                      id="prescription-file"
                      accept=".pdf,.png,.jpg,.jpeg"
                      onChange={(e) => {
                        if (e.target.files?.[0]) setFile(e.target.files[0]);
                      }}
                      className="hidden"
                      required={activeSetting?.requiresMedicalCert}
                    />
                    <label htmlFor="prescription-file" className="cursor-pointer block">
                      <UploadCloud className="w-8 h-8 text-gray-400 mx-auto mb-1" />
                      {file ? (
                        <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          {file.name} ({(file.size / 1024).toFixed(1)} KB)
                        </p>
                      ) : (
                        <p className="text-xs text-gray-500">
                          Upload medical doctor report (PDF, JPG, PNG &le; 10MB)
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
                  className="px-4 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || totalDays <= 0}
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
