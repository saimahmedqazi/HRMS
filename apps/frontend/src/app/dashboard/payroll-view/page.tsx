'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import {
  Building2,
  Info,
} from 'lucide-react';

export default function DepartmentPayrollSummaryPage() {
  const { user } = useAuth();
  const tenantScope = user?.supportModeCompanyId ?? user?.companyId;
  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();

  const [month, setMonth] = useState(currentMonth);
  const [year, setYear] = useState(currentYear);

  const formatMoney = (amount: number, currencyCode = 'USD') => {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode }).format(amount);
    } catch {
      return `${currencyCode} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    }
  };

  // Fetch Department Summary
  const { data: summary, isLoading, isError, refetch } = useQuery({
    queryKey: ['department-payroll-summary', user?.id, tenantScope, month, year],
    queryFn: () =>
      api.get<any>(`/payroll/department-summary?month=${month}&year=${year}`),
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Department Payroll Summary
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Read-only departmental compensation metrics and headcount overview.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                Month {m}
              </option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            {[2025, 2026, 2027].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Privacy Notice Banner */}
      <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-slate-600 dark:text-slate-300">
          <h4 className="font-semibold text-slate-900 dark:text-white">
            Privacy Sealed Department Overview
          </h4>
          <p className="mt-0.5">
            Individual employee compensation, allowances, and tax withholding amounts are strictly
            sealed. Only high-level departmental aggregates are made available to Department
            Managers.
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      {isLoading ? (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-12 text-center shadow-sm">
          <p role="status" className="text-sm text-gray-500">Loading department payroll summary…</p>
        </div>
      ) : isError ? (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-12 text-center shadow-sm">
          <p role="alert" className="text-sm text-gray-700 dark:text-gray-200">Could not load department payroll summary.</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-3 rounded-lg bg-primary-600 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-700"
          >
            Try again
          </button>
        </div>
      ) : (Array.isArray(summary) ? summary : summary ? [summary] : []).length > 0 ? (
        <div className="space-y-6">
          {(Array.isArray(summary) ? summary : [summary]).map((deptSummary: any, idx: number) => (
            <div
              key={deptSummary.departmentId || idx}
              className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 shadow-sm"
            >
              <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-primary-50 dark:bg-primary-950/40 text-primary-600 rounded-lg">
                    <Building2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                      {deptSummary.departmentName} Department
                    </h2>
                    <p className="text-xs text-gray-500">
                      Cycle: {deptSummary.month}/{deptSummary.year}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xs text-gray-400">Department Headcount</span>
                  <p className="text-xl font-extrabold text-gray-900 dark:text-white">
                    {deptSummary.headcount} employee(s)
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
                <div className="p-4 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-100 dark:border-gray-800">
                  <span className="text-xs uppercase text-gray-500 font-medium">Total Gross</span>
                  <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">
                    {formatMoney(Number(deptSummary.totalGross || 0), deptSummary.currencyCode || 'USD')}
                  </p>
                </div>

                <div className="p-4 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-100 dark:border-gray-800">
                  <span className="text-xs uppercase text-gray-500 font-medium">Total Withholding</span>
                  <p className="text-xl font-bold text-rose-500 mt-1">
                    {formatMoney(Number(deptSummary.totalDeductions || 0), deptSummary.currencyCode || 'USD')}
                  </p>
                </div>

                <div className="p-4 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-100 dark:border-gray-800">
                  <span className="text-xs uppercase text-gray-500 font-medium">Total Net Payout</span>
                  <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                    {formatMoney(Number(deptSummary.totalNet || 0), deptSummary.currencyCode || 'USD')}
                  </p>
                </div>

                <div className="p-4 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-100 dark:border-gray-800">
                  <span className="text-xs uppercase text-gray-500 font-medium">Average Net / Head</span>
                  <p className="text-xl font-bold text-blue-600 dark:text-blue-400 mt-1">
                    {formatMoney(Number(deptSummary.averageNet || 0), deptSummary.currencyCode || 'USD')}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-12 text-center shadow-sm">
          <Building2 className="w-10 h-10 text-gray-400 mx-auto mb-3 opacity-60" />
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">
            No department payroll recorded for this period
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            Department compensation will appear here once HR executes the payroll run.
          </p>
        </div>
      )}
    </div>
  );
}
