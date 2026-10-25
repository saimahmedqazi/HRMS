'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Laptop,
  CheckCircle2,
  XCircle,
  Package,
  Plus,
  Clock,
  Layers,
} from 'lucide-react';

export default function ResourcesDashboardPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [resourceType, setResourceType] = useState('');
  const [description, setDescription] = useState('');
  const [justification, setJustification] = useState('');

  // Fulfillment / Approval state
  const [actionModalOpen, setActionModalOpen] = useState(false);
  const [selectedReq, setSelectedReq] = useState<any>(null);
  const [actionType, setActionType] = useState<'APPROVE' | 'REJECT' | 'FULFILL'>('APPROVE');
  const [actionNotes, setActionNotes] = useState('');

  // Fetch current user
  const { data: user } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<any>('/auth/me'),
  });

  // Fetch resource requests
  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['resource-requests'],
    queryFn: () => api.get<any[]>('/resources/requests'),
  });

  // Create Request Mutation
  const createMutation = useMutation({
    mutationFn: () =>
      api.post('/resources/requests', {
        resourceType,
        description,
        justification: justification || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resource-requests'] });
      setModalOpen(false);
      setResourceType('');
      setDescription('');
      setJustification('');
    },
  });

  // Approve / Reject Mutation
  const approveMutation = useMutation({
    mutationFn: () =>
      api.post(`/resources/requests/${selectedReq.id}/approve`, {
        decision: actionType === 'APPROVE' ? 'APPROVE' : 'REJECT',
        notes: actionNotes || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resource-requests'] });
      setActionModalOpen(false);
      setSelectedReq(null);
      setActionNotes('');
    },
  });

  // Fulfill Mutation
  const fulfillMutation = useMutation({
    mutationFn: () =>
      api.post(`/resources/requests/${selectedReq.id}/fulfill`, {
        notes: actionNotes || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resource-requests'] });
      setActionModalOpen(false);
      setSelectedReq(null);
      setActionNotes('');
    },
  });

  const isOpsOrAdmin =
    user?.role === 'COMPANY_ADMIN' ||
    user?.role === 'HR_MANAGER' ||
    user?.role === 'OPERATION_MANAGER' ||
    user?.role === 'SUPER_ADMIN';

  const isManager =
    user?.role === 'DEPARTMENT_MANAGER' ||
    user?.role === 'TEAM_LEAD' ||
    isOpsOrAdmin;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Resource Requests
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Request, approve, and track hardware, peripherals, and software licensing.
          </p>
        </div>

        <div>
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 hover:bg-primary-700 text-white shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Request Resource
          </button>
        </div>
      </div>

      {/* Requests Table */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            Resource Requisitions
          </h2>
          <span className="text-xs text-gray-500">{requests.length} total</span>
        </div>

        {requests.length === 0 ? (
          <div className="p-12 text-center">
            <Package className="w-10 h-10 text-gray-400 mx-auto mb-3 opacity-60" />
            <h3 className="text-sm font-medium text-gray-900 dark:text-white">
              No resource requests submitted
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Submit hardware or software requests when equipment is needed.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800/50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-3">Applicant</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Resource</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Submitted</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {requests.map((req: any) => {
                  const emp = req.requestedBy;
                  const canApprove = req.status === 'PENDING' && isManager;
                  const canFulfill = req.status === 'STEP_1_APPROVED' && isOpsOrAdmin;

                  return (
                    <tr
                      key={req.id}
                      className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30"
                    >
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                        {emp?.firstName} {emp?.lastName}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {emp?.department?.name || '—'}
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">
                        {req.resourceType}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 max-w-sm truncate">
                        {req.description}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {new Date(req.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={req.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canApprove ? (
                          <div className="inline-flex gap-1.5">
                            <button
                              onClick={() => {
                                setSelectedReq(req);
                                setActionType('APPROVE');
                                setActionModalOpen(true);
                              }}
                              className="px-2.5 py-1 text-xs font-semibold rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 hover:bg-emerald-100"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => {
                                setSelectedReq(req);
                                setActionType('REJECT');
                                setActionModalOpen(true);
                              }}
                              className="px-2.5 py-1 text-xs font-semibold rounded bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 hover:bg-rose-100"
                            >
                              Reject
                            </button>
                          </div>
                        ) : canFulfill ? (
                          <button
                            onClick={() => {
                              setSelectedReq(req);
                              setActionType('FULFILL');
                              setActionModalOpen(true);
                            }}
                            className="px-3 py-1 text-xs font-semibold rounded-lg bg-primary-600 hover:bg-primary-700 text-white shadow-sm"
                          >
                            Fulfill
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

      {/* Create Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-800">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                Request Resource
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none"
              >
                &times;
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate();
              }}
              className="mt-4 space-y-4 text-sm"
            >
              <div>
                <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
                  Resource Category / Item
                </label>
                <input
                  type="text"
                  placeholder="e.g. Ergonomic Office Chair, 4K Display, RAM Upgrade"
                  value={resourceType}
                  onChange={(e) => setResourceType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 text-xs"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
                  Technical Specifications / Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Provide precise equipment or software license requirements..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 text-xs"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
                  Business Justification (Optional)
                </label>
                <textarea
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  rows={2}
                  placeholder="Explain why this equipment is needed for project delivery..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 text-xs"
                />
              </div>

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
                  disabled={createMutation.isPending}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-primary-600 hover:bg-primary-700 text-white"
                >
                  {createMutation.isPending ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Action / Fulfillment Modal */}
      {actionModalOpen && selectedReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-800">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                {actionType === 'FULFILL'
                  ? 'Fulfill Resource Request'
                  : actionType === 'APPROVE'
                  ? 'Approve Resource Request'
                  : 'Reject Resource Request'}
              </h3>
              <button
                onClick={() => setActionModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none"
              >
                &times;
              </button>
            </div>

            <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-500">Item:</span>
                <span className="font-semibold text-gray-900 dark:text-white">
                  {selectedReq.resourceType}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Applicant:</span>
                <span className="font-semibold text-gray-900 dark:text-white">
                  {selectedReq.requestedBy?.firstName} {selectedReq.requestedBy?.lastName}
                </span>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
                  {actionType === 'FULFILL' ? 'Fulfillment Notes / Asset Tag' : 'Approver Notes'}
                </label>
                <textarea
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  rows={3}
                  placeholder={
                    actionType === 'FULFILL'
                      ? 'Asset Tag # Zen-HW-0012 provisioned and handed over.'
                      : 'Provide notes or instructions...'
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
                onClick={() => {
                  if (actionType === 'FULFILL') {
                    fulfillMutation.mutate();
                  } else {
                    approveMutation.mutate();
                  }
                }}
                disabled={approveMutation.isPending || fulfillMutation.isPending}
                className={`px-4 py-2 text-xs font-semibold rounded-lg text-white ${
                  actionType === 'REJECT'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-primary-600 hover:bg-primary-700'
                }`}
              >
                Confirm {actionType === 'FULFILL' ? 'Fulfillment' : actionType}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
