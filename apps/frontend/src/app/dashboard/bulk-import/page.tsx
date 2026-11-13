'use client';

import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, API_PREFIX, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import {
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  Download,
  Play,
} from 'lucide-react';

interface RowError {
  row: number;
  field: string;
  message: string;
}

interface PreviewResult {
  totalRows: number;
  validCount: number;
  invalidCount: number;
  errors: RowError[];
  sampleValid: {
    firstName: string;
    lastName: string;
    email: string;
    employeeCode: string;
    hireDate: string;
    departmentName?: string;
    designationName?: string;
  }[];
}

interface ImportJob {
  id: string;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  importedCount: number;
  failedCount: number;
  errors: RowError[];
  failureReason: string | null;
}

function updateImportJobUrl(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set('importJob', id);
  else url.searchParams.delete('importJob');
  window.history.replaceState(window.history.state, '', url);
}

function downloadErrorReport(errors: RowError[]) {
  const csvCell = (value: string | number) => {
    const text = String(value);
    const safeText = /^[\s]*[=+\-@]|^[\t\r\n]/.test(text) ? `'${text}` : text;
    return `"${safeText.replaceAll('"', '""')}"`;
  };
  const rows = [['Row', 'Field', 'Reason'], ...errors.map(({ row, field, message }) => [row, field, message])];
  const file = new Blob(['\uFEFF', rows.map(row => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'bulk-import-errors.csv';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ImportErrorReport({ errors, preview = false }: { errors: RowError[]; preview?: boolean }) {
  if (!errors.length) return null;

  return (
    <section className="bg-white dark:bg-gray-900 border border-rose-200 dark:border-rose-900/50 rounded-xl shadow-sm overflow-hidden">
      <div className="p-4 bg-rose-50/50 dark:bg-rose-950/30 border-b border-rose-200 dark:border-rose-900/50 flex flex-wrap gap-3 items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-rose-900 dark:text-rose-200">
            {preview ? 'Validation errors' : 'Import errors'} ({errors.length})
          </h3>
        </div>
        <button type="button" onClick={() => downloadErrorReport(errors)} className="inline-flex items-center gap-2 text-xs font-semibold text-rose-700 hover:underline dark:text-rose-300">
          <Download className="h-4 w-4" /> Download error report
        </button>
      </div>
      <div className="overflow-auto max-h-64">
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 uppercase">
            <tr>
              <th scope="col" className="px-4 py-2">Row</th>
              <th scope="col" className="px-4 py-2">Field</th>
              <th scope="col" className="px-4 py-2">Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {errors.map(({ row, field, message }) => (
              <tr key={`${row}-${field}`} className="hover:bg-rose-50/20">
                <td className="px-4 py-2 font-mono font-bold text-gray-900 dark:text-white">Row {row}</td>
                <td className="px-4 py-2 text-rose-600 font-medium">{field}</td>
                <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function isUnavailableJob(error: unknown) {
  return error instanceof ApiError && (error.status === 403 || error.status === 404);
}

export default function BulkImportDashboardPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    setJobId(new URLSearchParams(window.location.search).get('importJob'));
  }, []);

  const jobQuery = useQuery({
    queryKey: ['bulk-import-job', user?.id, user?.supportModeCompanyId ?? user?.companyId, jobId],
    queryFn: ({ signal }) => api.get<ImportJob>(`/employees/bulk/jobs/${encodeURIComponent(jobId!)}`, { signal }),
    enabled: Boolean(jobId && user?.id),
    retry: false,
    refetchInterval: (query) => {
      const { data, error } = query.state;
      if (data?.status === 'COMPLETED' || data?.status === 'FAILED' || isUnavailableJob(error)) return false;
      return 1000;
    },
  });
  const job = jobQuery.data;
  const unavailableJob = isUnavailableJob(jobQuery.error);
  const importResult = !unavailableJob && (job?.status === 'COMPLETED' || job?.status === 'FAILED') ? job : null;

  useEffect(() => {
    if (importResult?.importedCount) void queryClient.invalidateQueries({ queryKey: ['employees'] });
  }, [importResult, queryClient]);

  // Preview Mutation
  const previewMutation = useMutation({
    mutationFn: async (upload: File) => {
      const formData = new FormData();
      formData.append('file', upload);
      return api.post<PreviewResult>('/employees/bulk/preview', formData);
    },
    onSuccess: (data) => {
      setPreviewResult(data);
      setErrorMessage('');
    },
    onError: (err) => {
      setErrorMessage(err.message || 'Failed to preview file.');
    },
  });

  // Execute Mutation
  const executeMutation = useMutation({
    mutationFn: async (upload: File) => {
      const formData = new FormData();
      formData.append('file', upload);
      return api.post<Pick<ImportJob, 'id' | 'status'>>('/employees/bulk/execute', formData);
    },
    onSuccess: (data) => {
      setJobId(data.id);
      updateImportJobUrl(data.id);
      setPreviewResult(null);
      setFile(null);
      setErrorMessage('');
    },
    onError: (err) => {
      setErrorMessage(err.message || 'Failed to execute import.');
    },
  });

  const pendingJob = Boolean(jobId && !importResult && !unavailableJob);
  const isBusy = previewMutation.isPending || executeMutation.isPending || pendingJob;
  const hasFailures = importResult?.status === 'FAILED' || Boolean(importResult?.failedCount);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Bulk Employee Import
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Upload Excel spreadsheets (.xlsx, .csv) to batch onboard workforce profiles with validation.
          </p>
        </div>
        <a
          href={`${API_PREFIX}/employees/bulk/template`}
          download
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 shadow-sm"
        >
          <Download className="w-4 h-4" />
          Download Sample Template (.xlsx)
        </a>
      </div>

      {/* Error alert */}
      {errorMessage && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {pendingJob && (
        <div className="rounded-xl border border-gray-200 p-4 text-sm text-gray-700 dark:border-gray-800 dark:text-gray-200">
          <p role="status">
            {jobQuery.isError ? 'Could not check import progress. Retrying…'
              : job?.status === 'PROCESSING' ? 'Importing employee records…'
              : job?.status === 'QUEUED' ? 'Employee import queued…' : 'Checking import status…'}
          </p>
          {jobQuery.isError && (
            <button type="button" onClick={() => void jobQuery.refetch()} disabled={jobQuery.isFetching}
              className="mt-2 rounded-lg border border-gray-300 px-3 py-2 font-medium disabled:opacity-50 dark:border-gray-700">
              Check status now
            </button>
          )}
        </div>
      )}
      {unavailableJob && (
        <p role="status" className="rounded-xl border border-amber-300 p-4 text-sm text-amber-800 dark:text-amber-200">
          This import is unavailable. Select a file to start a new import.
        </p>
      )}

      {importResult && (
        <div className="space-y-4">
          <div role="status" className={`p-5 border rounded-xl ${hasFailures
            ? 'bg-amber-50 border-amber-300 text-amber-950 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-100'
            : 'bg-emerald-50 border-emerald-300 text-emerald-950 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-100'}`}>
            <div className="flex items-start gap-3">
              {hasFailures ? <AlertTriangle className="w-5 h-5 shrink-0" /> : <CheckCircle2 className="w-5 h-5 shrink-0" />}
              <div>
                <h2 className="text-sm font-bold">
                  {importResult.status === 'FAILED' ? 'Bulk import stopped' : hasFailures ? 'Bulk import finished with errors' : 'Bulk import complete'}
                </h2>
                <p className="text-xs mt-1">{importResult.importedCount} imported · {importResult.failedCount} failed</p>
                {importResult.failureReason && <p className="text-xs mt-1">{importResult.failureReason}</p>}
                {importResult.importedCount > 0 && (
                  <p className="text-xs mt-1">Imported employees can set their password using <strong>Forgot password?</strong> on the sign-in page.</p>
                )}
              </div>
            </div>
          </div>
          <ImportErrorReport errors={importResult.errors} />
        </div>
      )}

      {/* File Upload Dropzone */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 shadow-sm">
        <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-8 text-center hover:bg-gray-50 dark:hover:bg-gray-800/40 transition">
          <input
            type="file"
            id="excel-file-input"
            accept=".xlsx,.xls,.csv"
            disabled={isBusy}
            onChange={(e) => {
              const selected = e.currentTarget.files?.[0];
              if (selected) {
                setFile(selected);
                setPreviewResult(null);
                setJobId(null);
                updateImportJobUrl(null);
                setErrorMessage('');
              }
              e.currentTarget.value = '';
            }}
            className="hidden"
          />
          <label htmlFor="excel-file-input" className="cursor-pointer block">
            <UploadCloud className="w-12 h-12 text-primary-600 dark:text-primary-400 mx-auto mb-2" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              {file ? file.name : 'Choose an Excel or CSV file to import'}
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Required columns: <code>firstName, lastName, email, employeeCode, hireDate</code>
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
            onClick={() => { if (file) previewMutation.mutate(file); }}
            disabled={!file || isBusy}
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

          <ImportErrorReport errors={previewResult.errors} preview />

          {/* Sample Valid Rows Preview */}
          {previewResult.sampleValid.length > 0 && (
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
                    {previewResult.sampleValid.map((row) => (
                      <tr key={row.employeeCode}>
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
              onClick={() => { if (file) executeMutation.mutate(file); }}
              disabled={!file || previewResult.validCount === 0 || isBusy}
              className="px-5 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm disabled:opacity-50"
            >
              {executeMutation.isPending ? 'Queueing...' : `Confirm Import (${previewResult.validCount} Employees)`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
