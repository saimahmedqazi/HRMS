'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, API_BASE_URL } from '@/lib/api';
import { StatusBadge } from '@/components/ui/status-badge';
import { CreditCard, Download, Calendar, DollarSign } from 'lucide-react';

export default function MyPayslipsPage() {
  const { data: payslips = [], isLoading } = useQuery({
    queryKey: ['my-payslips'],
    queryFn: () => api.get<any[]>('/payroll/payslips'),
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
          My Payslips
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          View and download your official monthly compensation statements.
        </p>
      </div>

      {/* Main Table */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm overflow-hidden">
        {payslips.length === 0 ? (
          <div className="p-12 text-center">
            <CreditCard className="w-10 h-10 text-gray-400 mx-auto mb-3 opacity-60" />
            <h3 className="text-sm font-medium text-gray-900 dark:text-white">
              No payslips issued yet
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Your payslip statements will appear here after payroll processing.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800/50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-3">Pay Period</th>
                  <th className="px-4 py-3">Base Salary</th>
                  <th className="px-4 py-3">Allowances</th>
                  <th className="px-4 py-3">Deductions</th>
                  <th className="px-4 py-3">Income Tax</th>
                  <th className="px-4 py-3">Net Disbursed</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Download</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {payslips.map((p: any) => (
                  <tr key={p.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                    <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">
                      {p.month.toString().padStart(2, '0')}/{p.year}
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
                    <td className="px-4 py-3 font-extrabold text-emerald-600 dark:text-emerald-400">
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
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary-600 hover:bg-primary-700 text-white shadow-sm"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download PDF
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
