'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  CheckCircle2,
  XCircle,
  FileText,
  User,
  Building,
  Calendar,
  AlertCircle,
  Clock,
  Download,
} from 'lucide-react';

export default function LeaveApprovalsPage() {
  const queryClient = useQueryClient();
  const [actionModalOpen, setActionModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [decision, setDecision] = useState<'APPROVE' | 'REJECT'>('APPROVE');
  const [notes, setNotes] = useState('');
  const [activeTab, setActiveTab] = useState<'pending' | 'all'>('pending');

  // Fetch current user
  const { data: user } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<any>('/auth/me'),
  });

  // Fetch leave requests
  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['leave-requests-approval'],
    queryFn: () => api.get<any[]>('/leave/requests'),
  });

  // Filter requests that require action
  const pendingRequests = requests.filter((r) => {
    if (r.status !== 'PENDING') return false;
    // Step 1 pending and user is step 1 approver or manager/admin
    if (r.step1Status === 'PENDING') {
      return (
        r.step1ApproverId === user?.id ||
        user?.role === 'COMPANY_ADMIN' ||
        user?.role === 'HR_MANAGER' ||
        user?.role === 'DEPARTMENT_MANAGER' ||
        user?.role === 'TEAM_LEAD'
      );
    }
    // Step 2 pending and user is step 2 approver or HR/Admin
    if (r.step2Status === 'PENDING') {
      return (
        r.step2ApproverId === user?.id ||
        user?.role === 'COMPANY_ADMIN' ||
        user?.role === 'HR_MANAGER'
      );
    }
    return false;
  });

  const displayedRequests = activeTab === 'pending' ? pendingRequests : requests;

  // Decision Mutation
  const decisionMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRequest) return;
      const step = selectedRequest.step1Status === 'PENDING' ? 'step1' : 'step2';
      return api.post(`/leave/requests/${selectedRequest.id}/${step}`, {
        decision,
        notes: notes || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-requests-approval'] });
      setActionModalOpen(false);
      setSelectedRequest(null);
      setNotes('');
    },
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Leave Approvals
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Review and adjudicate reporting-line leave submissions and medical verifications.
          </p>
        </div>

        {/* Tab Filters */}
        <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg text-xs font-medium">
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-3 py-1.5 rounded-md transition ${
              activeTab === 'pending'
                ? 'bg-white dark:bg-gray-900 text-primary-600 shadow-sm font-semibold'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
            }`}
          >
            Action Required ({pendingRequests.length})
          </button>
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-md transition ${
              activeTab === 'all'
                ? 'bg-white dark:bg-gray-900 text-primary-600 shadow-sm font-semibold'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
            }`}
          >
            All Company Leaves ({requests.length})
          </button>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm overflow-hidden">
        {displayedRequests.length === 0 ? (
          <div className="p-12 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3 opacity-60" />
            <h3 className="text-sm font-medium text-gray-900 dark:text-white">
              No leave requests awaiting your action
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              All team leave submissions in your reporting line have been resolved.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800/50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Prescription</th>
                  <th className="px-4 py-3">Step 1</th>
                  <th className="px-4 py-3">Step 2</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {displayedRequests.map((req: any) => {
                  const emp = req.employee;
                  const canAct =
                    req.status === 'PENDING' &&
                    ((req.step1Status === 'PENDING' &&
                      (req.step1ApproverId === user?.id ||
                        user?.role === 'COMPANY_ADMIN' ||
                        user?.role === 'HR_MANAGER' ||
                        user?.role === 'DEPARTMENT_MANAGER' ||
                        user?.role === 'TEAM_LEAD')) ||
                      (req.step2Status === 'PENDING' &&
                        (req.step2ApproverId === user?.id ||
                          user?.role === 'COMPANY_ADMIN' ||
                          user?.role === 'HR_MANAGER')));

                  return (
                    <tr
                      key={req.id}
                      className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30"
                    >
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-900 dark:text-white">
                          {emp?.firstName} {emp?.lastName}
                        </div>
                        <div className="text-xs text-gray-400">
                          {emp?.user?.email || emp?.employeeCode}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">
                        {emp?.department?.name || '—'}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                        {req.leaveTypeSetting?.leaveType}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">
                        <div>
                          {new Date(req.startDate).toLocaleDateString()} &rarr;{' '}
                          {new Date(req.endDate).toLocaleDateString()}
                        </div>
                        <span className="font-semibold text-gray-900 dark:text-white">
                          {req.totalDays} day(s)
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 max-w-xs truncate">
                        {req.reason || '—'}
                      </td>
                      <td className="px-4 py-3">
                        {req.medicalCertUrl ? (
                          <a
                            href={req.medicalCertUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 dark:bg-emerald-950/50 dark:text-emerald-400 rounded-md hover:bg-emerald-100"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Prescription
                          </a>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={req.step1Status} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={req.step2Status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canAct ? (
                          <button
                            onClick={() => {
                              setSelectedRequest(req);
                              setDecision('APPROVE');
                              setActionModalOpen(true);
                            }}
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary-600 hover:bg-primary-700 text-white shadow-sm"
                          >
                            Review
                          </button>
                        ) : (
                          <StatusBadge status={req.status} />
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

      {/* Decision Action Modal */}
      {actionModalOpen && selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-800">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                Adjudicate Leave Request
              </h3>
              <button
                onClick={() => setActionModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none"
              >
                &times;
              </button>
            </div>

            <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-gray-500">Applicant:</span>
                <span className="font-semibold text-gray-900 dark:text-white">
                  {selectedRequest.employee?.firstName} {selectedRequest.employee?.lastName}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Duration:</span>
                <span className="font-semibold text-gray-900 dark:text-white">
                  {selectedRequest.totalDays} calendar day(s)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Type:</span>
                <span className="font-semibold text-gray-900 dark:text-white">
                  {selectedRequest.leaveTypeSetting?.leaveType}
                </span>
              </div>
              {selectedRequest.medicalCertUrl && (
                <div className="flex justify-between items-center pt-1 border-t border-gray-200 dark:border-gray-700">
                  <span className="text-gray-500">Medical Doc:</span>
                  <a
                    href={selectedRequest.medicalCertUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-600 hover:underline flex items-center gap-1 font-medium"
                  >
                    <Download className="w-3 h-3" />
                    Download File
                  </a>
                </div>
              )}
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
                  Decision
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setDecision('APPROVE')}
                    className={`py-2 px-3 text-xs font-medium rounded-lg border flex items-center justify-center gap-2 ${
                      decision === 'APPROVE'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : 'border-gray-300 dark:border-gray-700 text-gray-600'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => setDecision('REJECT')}
                    className={`py-2 px-3 text-xs font-medium rounded-lg border flex items-center justify-center gap-2 ${
                      decision === 'REJECT'
                        ? 'border-rose-600 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                        : 'border-gray-300 dark:border-gray-700 text-gray-600'
                    }`}
                  >
                    <XCircle className="w-4 h-4" />
                    Reject
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
                  Approver Remarks / Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder={
                    decision === 'APPROVE'
                      ? 'Approved. Work coverage confirmed.'
                      : 'Provide explicit rejection feedback...'
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-gray-200 dark:border-gray-800">
              <button
                type="button"
                onClick={() => setActionModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => decisionMutation.mutate()}
                disabled={decisionMutation.isPending}
                className={`px-4 py-2 text-xs font-semibold rounded-lg text-white ${
                  decision === 'APPROVE'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {decisionMutation.isPending
                  ? 'Submitting...'
                  : `Confirm ${decision === 'APPROVE' ? 'Approval' : 'Rejection'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
