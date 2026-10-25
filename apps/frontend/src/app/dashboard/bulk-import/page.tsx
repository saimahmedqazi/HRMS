'use client';

import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Download,
  Play,
  RefreshCw,
} from 'lucide-react';

export default function BulkImportDashboardPage() {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [previewResult, setPreviewResult] = useState<any>(null);
  const [importResult, setImportResult] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState('');

  // Preview Mutation
  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!file) return;
      const formData = new FormData();
      formData.append('file', file);
      return api.post('/employees/bulk/preview', formData);
    },
    onSuccess: (data: any) => {
      setPreviewResult(data);
      setImportResult(null);
      setErrorMessage('');
    },
    onError: (err: any) => {
      setErrorMessage(err.message || 'Failed to preview file.');
    },
  });

  // Execute Mutation
  const executeMutation = useMutation({
    mutationFn: async () => {
      if (!file) return;
      const formData = new FormData();
      formData.append('file', file);
      return api.post('/employees/bulk/execute', formData);
    },
    onSuccess: (data: any) => {
      setImportResult(data);
      setPreviewResult(null);
      setFile(null);
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
    onError: (err: any) => {
      setErrorMessage(err.message || 'Failed to execute import.');
    },
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
          Bulk Employee Import
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Upload Excel spreadsheets (.xlsx, .csv) to batch onboard workforce profiles with validation.
        </p>
      </div>

      {/* Error alert */}
      {errorMessage && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Import Success Banner */}
      {importResult && (
        <div className="p-5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-xl">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            <div>
              <h3 className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
                Bulk Import Completed Successfully!
              </h3>
              <p className="text-xs text-emerald-800 dark:text-emerald-300 mt-1">
                Successfully onboarded <strong>{importResult.importedCount}</strong> new employee accounts.
                Default credentials, probationary shifts, and annual leave balances have been initialized.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* File Upload Dropzone */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 shadow-sm">
        <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-8 text-center hover:bg-gray-50 dark:hover:bg-gray-800/40 transition">
          <input
            type="file"
            id="excel-file-input"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => {
              if (e.target.files?.[0]) {
                setFile(e.target.files[0]);
                setPreviewResult(null);
                setImportResult(null);
              }
            }}
            className="hidden"
          />
          <label htmlFor="excel-file-input" className="cursor-pointer block">
            <UploadCloud className="w-12 h-12 text-primary-600 dark:text-primary-400 mx-auto mb-2" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              {file ? file.name : 'Choose an Excel or CSV file to import'}
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Required columns: <code>firstName, lastName, email, employeeCode, hireDate, departmentName, designationName</code>
            </p>
            {file && (
              <span className="inline-block mt-3 px-3 py-1 bg-primary-50 dark:bg-primary-950/50 text-primary-700 dark:text-primary-300 text-xs rounded-full font-medium">
                {(file.size / 1024).toFixed(1)} KB • Ready to inspect
              </span>
            )}
          </label>
        </div>

        <div className="flex justify-end gap-3 mt-4">
          <button
            onClick={() => previewMutation.mutate()}
            disabled={!file || previewMutation.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-primary-600 hover:bg-primary-700 text-white shadow-sm disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5" />
            {previewMutation.isPending ? 'Validating...' : 'Validate & Preview Sheet'}
          </button>
        </div>
      </div>

      {/* Preview Section */}
      {previewResult && (
        <div className="space-y-6">
          {/* Summary Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
              <span className="text-xs uppercase text-gray-500 font-semibold">Total Rows</span>
              <p className="text-2xl font-extrabold text-gray-900 dark:text-white mt-1">
                {previewResult.totalRows}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
              <span className="text-xs uppercase text-emerald-600 font-semibold">Valid Rows</span>
              <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">
                {previewResult.validCount}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
              <span className="text-xs uppercase text-rose-600 font-semibold">Invalid Rows</span>
              <p className="text-2xl font-extrabold text-rose-600 mt-1">
                {previewResult.invalidCount}
              </p>
            </div>
          </div>

          {/* Error Report Table */}
          {previewResult.errors?.length > 0 && (
            <div className="bg-white dark:bg-gray-900 border border-rose-200 dark:border-rose-900/50 rounded-xl shadow-sm overflow-hidden">
              <div className="p-4 bg-rose-50/50 dark:bg-rose-950/30 border-b border-rose-200 dark:border-rose-900/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-rose-900 dark:text-rose-200">
                    Validation Errors ({previewResult.errors.length})
                  </h3>
                </div>
                <span className="text-xs text-rose-700 dark:text-rose-300">
                  Invalid rows will be automatically skipped during execution
                </span>
              </div>
              <div className="overflow-x-auto max-h-64">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 uppercase">
                    <tr>
                      <th className="px-4 py-2">Row #</th>
                      <th className="px-4 py-2">Field</th>
                      <th className="px-4 py-2">Validation Failure Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {previewResult.errors.map((err: any, idx: number) => (
                      <tr key={idx} className="hover:bg-rose-50/20">
                        <td className="px-4 py-2 font-mono font-bold text-gray-900 dark:text-white">
                          Row {err.row}
                        </td>
                        <td className="px-4 py-2 text-rose-600 font-medium">{err.field}</td>
                        <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{err.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sample Valid Rows Preview */}
          {previewResult.sampleValid?.length > 0 && (
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm overflow-hidden">
              <div className="p-4 border-b border-gray-200 dark:border-gray-800">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                  Valid Records Sample Preview
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 uppercase">
                    <tr>
                      <th className="px-4 py-2.5">Name</th>
                      <th className="px-4 py-2.5">Email</th>
                      <th className="px-4 py-2.5">Code</th>
                      <th className="px-4 py-2.5">Department</th>
                      <th className="px-4 py-2.5">Designation</th>
                      <th className="px-4 py-2.5">Hire Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {previewResult.sampleValid.map((row: any, idx: number) => (
                      <tr key={idx}>
                        <td className="px-4 py-2.5 font-semibold text-gray-900 dark:text-white">
                          {row.firstName} {row.lastName}
                        </td>
                        <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400">{row.email}</td>
                        <td className="px-4 py-2.5 font-mono">{row.employeeCode}</td>
                        <td className="px-4 py-2.5 text-gray-500">{row.departmentName || '—'}</td>
                        <td className="px-4 py-2.5 text-gray-500">{row.designationName || '—'}</td>
                        <td className="px-4 py-2.5 text-gray-500">{row.hireDate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Execution Bar */}
          <div className="flex items-center justify-between bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
            <span className="text-xs text-gray-500">
              Ready to import <strong>{previewResult.validCount}</strong> valid personnel into ZenHR.
            </span>
            <button
              onClick={() => executeMutation.mutate()}
              disabled={previewResult.validCount === 0 || executeMutation.isPending}
              className="px-5 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm disabled:opacity-50"
            >
              {executeMutation.isPending ? 'Importing...' : `Confirm Import (${previewResult.validCount} Employees)`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
