'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, API_BASE_URL } from '@/lib/api';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  CreditCard,
  Download,
  Play,
  FileSpreadsheet,
  Calendar,
  DollarSign,
  TrendingUp,
  CheckCircle2,
  Users,
} from 'lucide-react';

export default function PayrollDashboardPage() {
  const queryClient = useQueryClient();
  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();

  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonth);
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [modalOpen, setModalOpen] = useState(false);
  const [runMonth, setRunMonth] = useState<number>(currentMonth);
  const [runYear, setRunYear] = useState<number>(currentYear);

  // Fetch payslips for selected period
  const { data: payslips = [], isLoading } = useQuery({
    queryKey: ['payroll-payslips', selectedMonth, selectedYear],
    queryFn: () =>
      api.get<any[]>(`/payroll/payslips?month=${selectedMonth}&year=${selectedYear}`),
  });

  // Execute Payroll Run Mutation
  const executeMutation = useMutation({
    mutationFn: () =>
      api.post('/payroll/runs', {
        month: runMonth,
        year: runYear,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll-payslips'] });
      setModalOpen(false);
    },
  });

  // Calculate totals
  const totalNet = payslips.reduce((sum, p) => sum + Number(p.netSalary), 0);
  const totalGross = payslips.reduce(
    (sum, p) => sum + Number(p.baseSalary) + Number(p.allowances) + Number(p.bonuses),
    0,
  );
  const totalDeductions = payslips.reduce(
    (sum, p) => sum + Number(p.deductions) + Number(p.taxAmount),
    0,
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Payroll Management
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Execute monthly compensation runs, review tax withholding, and export payslips.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <a
            href={`${API_BASE_URL}/api/v1/payroll/runs/pdf-bulk?month=${selectedMonth}&year=${selectedYear}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 shadow-sm"
          >
            <Download className="w-4 h-4" />
            Bulk Payslips PDF
          </a>
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-primary-600 hover:bg-primary-700 text-white shadow-sm"
          >
            <Play className="w-4 h-4" />
            Execute Payroll Run
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs uppercase font-medium">Headcount Processed</span>
            <Users className="w-4 h-4" />
          </div>
          <p className="text-2xl font-extrabold text-gray-900 dark:text-white">
            {payslips.length}
          </p>
          <span className="text-xs text-gray-400">Period: {selectedMonth}/{selectedYear}</span>
        </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs uppercase font-medium">Total Gross Payroll</span>
            <DollarSign className="w-4 h-4" />
          </div>
          <p className="text-2xl font-extrabold text-gray-900 dark:text-white">
            ${totalGross.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
          <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
            Base + Allowances
          </span>
        </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs uppercase font-medium">Taxes & Deductions</span>
            <CreditCard className="w-4 h-4" />
          </div>
          <p className="text-2xl font-extrabold text-gray-900 dark:text-white">
            ${totalDeductions.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
          <span className="text-xs text-rose-500 font-medium">Statutory Withholdings</span>
        </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs uppercase font-medium">Net Disbursable</span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
            ${totalNet.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
          <span className="text-xs text-gray-400">Total Net Payout</span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <label className="text-xs font-semibold uppercase text-gray-500">Pay Period:</label>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                Month {m}
              </option>
            ))}
          </select>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            {[2024, 2025, 2026, 2027].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <span className="text-xs text-gray-500">{payslips.length} payslip(s) issued</span>
      </div>

      {/* Payslips Table */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm overflow-hidden">
        {payslips.length === 0 ? (
          <div className="p-12 text-center">
            <CreditCard className="w-10 h-10 text-gray-400 mx-auto mb-3 opacity-60" />
            <h3 className="text-sm font-medium text-gray-900 dark:text-white">
              No payroll executed for this cycle
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Click &quot;Execute Payroll Run&quot; to batch generate payslips for all active employees.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800/50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Base Salary</th>
                  <th className="px-4 py-3">Allowances</th>
                  <th className="px-4 py-3">Deductions</th>
                  <th className="px-4 py-3">Tax</th>
                  <th className="px-4 py-3">Net Salary</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Download</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {payslips.map((p: any) => (
                  <tr key={p.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900 dark:text-white">
                        {p.employee?.firstName} {p.employee?.lastName}
                      </div>
                      <div className="text-xs text-gray-400">{p.employee?.employeeCode}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {p.employee?.department?.name || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                      ${Number(p.baseSalary).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-emerald-600 dark:text-emerald-400">
                      +${Number(p.allowances).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-rose-500">
                      -${Number(p.deductions).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-rose-500">
                      -${Number(p.taxAmount).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-bold text-gray-900 dark:text-white">
                      ${Number(p.netSalary).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <a
                        href={`${API_BASE_URL}/api/v1/payroll/payslips/${p.id}/pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-primary-700 bg-primary-50 dark:bg-primary-950/40 dark:text-primary-300 rounded hover:bg-primary-100"
                      >
                        <Download className="w-3.5 h-3.5" />
                        PDF
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Execute Run Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-800">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                Execute Monthly Payroll
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
                executeMutation.mutate();
              }}
              className="mt-4 space-y-4 text-sm"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
                    Month
                  </label>
                  <select
                    value={runMonth}
                    onChange={(e) => setRunMonth(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <option key={m} value={m}>
                        Month {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
                    Year
                  </label>
                  <select
                    value={runYear}
                    onChange={(e) => setRunYear(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  >
                    {[2025, 2026, 2027].map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/50 rounded-lg text-xs text-blue-800 dark:text-blue-300">
                This will batch compute salary, allowances, progressive tax brackets, and net pay for
                all active personnel, generating payslips and triggering notifications.
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
                  disabled={executeMutation.isPending}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-primary-600 hover:bg-primary-700 text-white"
                >
                  {executeMutation.isPending ? 'Processing...' : 'Start Execution'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
