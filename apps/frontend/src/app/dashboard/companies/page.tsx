'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Building2,
  ShieldCheck,
  ShieldAlert,
  Search,
  ExternalLink,
  Users,
  CreditCard,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

interface CompanyItem {
  id: string;
  name: string;
  email: string;
  domain?: string;
  status: string;
  subscriptionTier: string;
  employeeCount?: number;
  userCount?: number;
  createdAt: string;
}

export default function SuperAdminCompaniesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [supportModalCompany, setSupportModalCompany] = useState<CompanyItem | null>(null);
  const [supportReason, setSupportReason] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Fetch all companies platform-wide
  const { data: companies, isLoading } = useQuery<CompanyItem[]>({
    queryKey: ['super-admin', 'companies'],
    queryFn: () => api.get<CompanyItem[]>('/super-admin/companies'),
    enabled: user?.role === 'SUPER_ADMIN' || user?.role === 'OPERATION_MANAGER',
  });

  // Enter Support Mode mutation
  const enterSupportMutation = useMutation({
    mutationFn: ({ companyId, reason }: { companyId: string; reason: string }) =>
      api.post(`/super-admin/companies/${companyId}/support-mode/enter`, { reason }),
    onSuccess: () => {
      setSuccessMsg('Support Mode successfully activated for 1 hour. Redirecting...');
      setSupportModalCompany(null);
      setSupportReason('');
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 1000);
    },
    onError: (err: any) => {
      setErrorMsg(err.message || 'Failed to enter Support Mode.');
    },
  });

  // Toggle company status (Suspend / Reactivate)
  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/super-admin/companies/${id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'companies'] });
      setSuccessMsg('Company status updated successfully.');
      setTimeout(() => setSuccessMsg(null), 3000);
    },
    onError: (err: any) => {
      setErrorMsg(err.message || 'Failed to update company status.');
      setTimeout(() => setErrorMsg(null), 3000);
    },
  });

  if (user?.role !== 'SUPER_ADMIN' && user?.role !== 'OPERATION_MANAGER') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] p-6 text-center">
        <ShieldAlert className="h-12 w-12 text-rose-500 mb-3" />
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Access Restricted</h2>
        <p className="text-xs text-slate-500 max-w-sm mt-1">
          This portal is strictly reserved for platform Super Administrators and Operations Managers.
        </p>
      </div>
    );
  }

  const filteredCompanies = (companies || []).filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Client Organizations
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Platform-wide tenant administration, subscription tiers, and time-limited audited support mode.
          </p>
        </div>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-xl text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter companies by name or email..."
          className="w-full pl-10 pr-4 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Companies Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center min-h-[30vh]">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      ) : filteredCompanies.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
          <Building2 className="h-10 w-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No organizations found</p>
          <p className="text-xs text-slate-400 mt-1">Try adjusting your search criteria.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredCompanies.map((comp) => {
            const isSuspended = comp.status === 'SUSPENDED';
            const isPremium = comp.subscriptionTier === 'PREMIUM';

            return (
              <div
                key={comp.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col justify-between hover:border-blue-400 dark:hover:border-blue-600 transition"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="h-9 w-9 rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 flex items-center justify-center font-bold text-sm">
                        {comp.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          {comp.name}
                        </h3>
                        <p className="text-[11px] text-slate-400 truncate">{comp.email}</p>
                      </div>
                    </div>
                    <StatusBadge status={comp.status} />
                  </div>

                  <div className="grid grid-cols-2 gap-2 my-3.5 p-2.5 bg-slate-50 dark:bg-slate-950/60 rounded-xl text-xs">
                    <div>
                      <span className="text-[10px] uppercase font-semibold text-slate-400 block">Tier</span>
                      <span
                        className={`inline-block font-bold text-[11px] ${
                          isPremium ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400'
                        }`}
                      >
                        {comp.subscriptionTier}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-semibold text-slate-400 block">Created</span>
                      <span className="text-[11px] text-slate-600 dark:text-slate-300">
                        {new Date(comp.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
                  <button
                    onClick={() => setSupportModalCompany(comp)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Support Mode
                  </button>

                  {user?.role === 'SUPER_ADMIN' && (
                    <button
                      onClick={() =>
                        toggleStatusMutation.mutate({
                          id: comp.id,
                          status: isSuspended ? 'ACTIVE' : 'SUSPENDED',
                        })
                      }
                      disabled={toggleStatusMutation.isPending}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition ${
                        isSuspended
                          ? 'border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300'
                          : 'border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-900/60 dark:text-rose-400'
                      }`}
                    >
                      {isSuspended ? 'Reactivate' : 'Suspend'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Support Mode Reason Modal */}
      {supportModalCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-xl animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 flex items-center justify-center">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Enter Support Mode: {supportModalCompany.name}
                </h3>
                <p className="text-[11px] text-slate-400">1-Hour Time-Limited & Audited Session</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 mb-4 leading-relaxed">
              In accordance with multi-tenant security policies, entering a client workspace generates an immutable audit log record. Please state the specific customer ticket ID or reason for access.
            </p>

            <textarea
              value={supportReason}
              onChange={(e) => setSupportReason(e.target.value)}
              placeholder="e.g., Investigating payroll tax rule discrepancy ticket #ZEN-1049"
              rows={3}
              className="w-full text-xs p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
            />

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setSupportModalCompany(null);
                  setSupportReason('');
                }}
                className="px-3.5 py-2 text-xs font-semibold rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!supportReason.trim() || enterSupportMutation.isPending}
                onClick={() =>
                  enterSupportMutation.mutate({
                    companyId: supportModalCompany.id,
                    reason: supportReason.trim(),
                  })
                }
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 shadow-sm transition"
              >
                {enterSupportMutation.isPending ? 'Activating...' : 'Assume Workspace'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
