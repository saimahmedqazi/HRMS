'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, API_PREFIX } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  CreditCard,
  Download,
  Play,
  DollarSign,
  TrendingUp,
  CheckCircle2,
  Users,
  Plus,
  Trash2,
  Edit3,
  AlertTriangle,
} from 'lucide-react';

type EditableComponent = { name: string; type: 'ALLOWANCE' | 'DEDUCTION'; value: string; isPercentage: boolean; isPreTax: boolean };
type EditableTaxBracket = { min: string; max: string; rate: string };

export default function PayrollDashboardPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const tenantScope = user?.supportModeCompanyId ?? user?.companyId;
  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();

  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonth);
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [modalOpen, setModalOpen] = useState(false);
  const [runMonth, setRunMonth] = useState<number>(currentMonth);
  const [runYear, setRunYear] = useState<number>(currentYear);
  const [showStructureForm, setShowStructureForm] = useState(false);
  const [editingStructureId, setEditingStructureId] = useState<string | null>(null);
  const [archivingStructureId, setArchivingStructureId] = useState<string | null>(null);
  const [structureName, setStructureName] = useState('');
  const [structureBaseSalary, setStructureBaseSalary] = useState('');
  const [structureCurrency, setStructureCurrency] = useState('USD');
  const [structureIsDefault, setStructureIsDefault] = useState(false);
  const [structureComponents, setStructureComponents] = useState<EditableComponent[]>([]);
  const [structureTaxBrackets, setStructureTaxBrackets] = useState<EditableTaxBracket[]>([]);
  const [adjustingPayslip, setAdjustingPayslip] = useState<any | null>(null);
  const [adjustBaseSalary, setAdjustBaseSalary] = useState('');
  const [adjustBonuses, setAdjustBonuses] = useState('');
  const [adjustDeduction, setAdjustDeduction] = useState('');
  const [adjustNote, setAdjustNote] = useState('');
  const [confirmPeriodPaid, setConfirmPeriodPaid] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const {
    data: structures = [],
    isLoading: structuresLoading,
    isError: structuresError,
    refetch: refetchStructures,
  } = useQuery({
    queryKey: ['payroll-structures', user?.id, tenantScope],
    queryFn: () => api.get<any[]>('/payroll/structures'),
  });

  const structureMutation = useMutation({
    mutationFn: () => {
      const payload = {
      name: structureName.trim(),
      currencyCode: structureCurrency.trim().toUpperCase(),
      baseSalary: Number(structureBaseSalary),
      components: structureComponents.map((component) => ({
        ...component,
        value: Number(component.value),
      })),
      taxRules: {
        brackets: structureTaxBrackets.map((bracket) => ({
          min: Number(bracket.min),
          max: bracket.max.trim() ? Number(bracket.max) : null,
          rate: Number(bracket.rate) / 100,
        })),
      },
      isDefault: structureIsDefault,
      };
      return editingStructureId
        ? api.patch(`/payroll/structures/${editingStructureId}`, payload)
        : api.post('/payroll/structures', { ...payload, isDefault: structureIsDefault || structures.length === 0 });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['payroll-structures'] });
      void queryClient.invalidateQueries({ queryKey: ['payroll-payslips'] });
      setFeedback({
        type: 'success',
        message: editingStructureId ? 'Salary structure updated.' : 'Salary structure created.',
      });
      setShowStructureForm(false);
      setStructureName('');
      setStructureBaseSalary('');
      setStructureCurrency('USD');
      setEditingStructureId(null);
      setStructureIsDefault(false);
      setStructureComponents([]);
      setStructureTaxBrackets([]);
    },
  });

  const archiveStructureMutation = useMutation({
    mutationFn: (structureId: string) => api.delete(`/payroll/structures/${structureId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['payroll-structures'] });
      setArchivingStructureId(null);
      setFeedback({ type: 'success', message: 'Salary structure archived.' });
    },
    onError: (err: any) => {
      setArchivingStructureId(null);
      setFeedback({ type: 'error', message: err.message || 'Could not archive salary structure.' });
    },
  });

  const openStructureEditor = (structure: any) => {
    structureMutation.reset();
    setArchivingStructureId(null);
    setEditingStructureId(structure.id);
    setStructureName(structure.name);
    setStructureCurrency(structure.currencyCode || 'USD');
    setStructureBaseSalary(String(structure.baseSalary));
    setStructureIsDefault(Boolean(structure.isDefault));
    setStructureComponents((Array.isArray(structure.components) ? structure.components : []).map((item: any) => ({
      name: item.name,
      type: item.type,
      value: String(item.value),
      isPercentage: Boolean(item.isPercentage),
      isPreTax: item.isPreTax !== false,
    })));
    setStructureTaxBrackets((structure.taxRules?.brackets || []).map((bracket: any) => ({
      min: String(bracket.min),
      max: bracket.max === null ? '' : String(bracket.max),
      rate: String(Number(bracket.rate) * 100),
    })));
    setShowStructureForm(true);
  };

  const openAdjustModal = (payslip: any) => {
    adjustPayslipMutation.reset();
    const adjustment = payslip.breakdown?.adjustment;
    setAdjustingPayslip(payslip);
    setAdjustBaseSalary(String(Number(payslip.baseSalary ?? 0)));
    setAdjustBonuses(String(Number(payslip.bonuses ?? 0)));
    setAdjustDeduction(String(Number(adjustment?.adjustmentDeduction ?? payslip.breakdown?.adjustmentDeduction ?? 0)));
    setAdjustNote(typeof adjustment?.adjustmentNote === 'string' ? adjustment.adjustmentNote : '');
  };

  const formatMoney = (amount: number, currencyCode = 'USD') => {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode }).format(amount);
    } catch {
      return `${currencyCode} ${amount.toLocaleString()}`;
    }
  };

  // Fetch payslips for selected period
  const {
    data: payslips = [],
    isLoading,
    isError: payslipsError,
    refetch: refetchPayslips,
  } = useQuery({
    queryKey: ['payroll-payslips', user?.id, tenantScope, selectedMonth, selectedYear],
    queryFn: () =>
      api.get<any[]>(`/payroll/payslips?month=${selectedMonth}&year=${selectedYear}`),
  });

  // Execute Payroll Run Mutation
  const executeMutation = useMutation({
    mutationFn: (period: { month: number; year: number }) => api.post('/payroll/runs', period),
    onSuccess: (_, period) => {
      setSelectedMonth(period.month);
      setSelectedYear(period.year);
      setConfirmPeriodPaid(false);
      queryClient.invalidateQueries({ queryKey: ['payroll-payslips'] });
      setModalOpen(false);
      setFeedback({ type: 'success', message: `Payroll executed for ${period.month}/${period.year}.` });
    },
  });

  const adjustPayslipMutation = useMutation({
    mutationFn: () => {
      if (!adjustingPayslip) throw new Error('No payslip selected.');
      return api.patch(`/payroll/payslips/${adjustingPayslip.id}`, {
        baseSalary: Number(adjustBaseSalary),
        bonuses: Number(adjustBonuses),
        adjustmentDeduction: Number(adjustDeduction),
        adjustmentNote: adjustNote.trim() || null,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['payroll-payslips'] });
      setAdjustingPayslip(null);
      setFeedback({ type: 'success', message: 'Payslip adjustment saved and recalculated.' });
    },
  });

  const markPayslipPaidMutation = useMutation({
    mutationFn: (payslipId: string) => api.patch(`/payroll/payslips/${payslipId}/mark-paid`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['payroll-payslips'] });
      setFeedback({ type: 'success', message: 'Payslip marked as PAID and locked.' });
    },
    onError: (err: any) => {
      setFeedback({ type: 'error', message: err.message || 'Could not mark payslip as paid.' });
    },
  });

  const markPeriodPaidMutation = useMutation({
    mutationFn: (period: { month: number; year: number }) => api.post('/payroll/runs/mark-paid', period),
    onSuccess: (res: any) => {
      void queryClient.invalidateQueries({ queryKey: ['payroll-payslips'] });
      setConfirmPeriodPaid(false);
      setFeedback({
        type: 'success',
        message: res?.alreadyPaid
          ? `All payslips for ${selectedMonth}/${selectedYear} are already marked as PAID.`
          : `Marked ${res?.markedCount ?? 0} payslip(s) as PAID for ${selectedMonth}/${selectedYear}.`,
      });
    },
    onError: (err: any) => {
      setConfirmPeriodPaid(false);
      setFeedback({ type: 'error', message: err.message || 'Could not mark period as paid.' });
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
  const reportCurrency = payslips[0]?.currencyCode || 'USD';
  const unpaidPayslipCount = payslips.filter((p: any) => p.status !== 'PAID').length;

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
            href={`${API_PREFIX}/payroll/runs/pdf-bulk?month=${selectedMonth}&year=${selectedYear}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 shadow-sm"
          >
            <Download className="w-4 h-4" />
            Bulk Payslips PDF
          </a>
          <button
            onClick={() => {
              executeMutation.reset();
              setRunMonth(selectedMonth);
              setRunYear(selectedYear);
              setModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-primary-600 hover:bg-primary-700 text-white shadow-sm"
          >
            <Play className="w-4 h-4" />
            Execute Payroll Run
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          role={feedback.type === 'error' ? 'alert' : 'status'}
          className={`flex items-center justify-between rounded-xl border px-4 py-3 text-xs font-medium ${
            feedback.type === 'error'
              ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
          }`}
        >
          <span className="flex items-center gap-2">
            {feedback.type === 'error' ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
            {feedback.message}
          </span>
          <button type="button" onClick={() => setFeedback(null)} className="ml-4 text-xs underline opacity-80 hover:opacity-100">
            Dismiss
          </button>
        </div>
      )}

      {/* Configurable salary structures */}
      <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">Salary Structures</h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Set recurring earnings, deductions, and company-configured progressive tax brackets. Assign a package to each employee in their Job Details.</p>
          </div>
          <button type="button" onClick={() => { structureMutation.reset(); setEditingStructureId(null); setShowStructureForm((open) => !open); if (!showStructureForm) { setStructureName(''); setStructureCurrency('USD'); setStructureBaseSalary(''); setStructureIsDefault(false); setStructureComponents([]); setStructureTaxBrackets([]); } }} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-primary-700">
            <Plus className="h-4 w-4" /> {showStructureForm ? 'Close' : 'Add Structure'}
          </button>
        </div>

        {structuresLoading ? <p role="status" className="text-xs text-gray-500">Loading salary structures…</p> : structuresError ? (
          <div role="alert" className="flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
            <span>Could not load salary structures.</span>
            <button type="button" onClick={() => void refetchStructures()} className="rounded-md border border-rose-300 px-2.5 py-1 font-semibold hover:bg-rose-100 dark:border-rose-800 dark:hover:bg-rose-900/40">
              Try again
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {structures.map((structure: any) => (
              <article key={structure.id} className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{structure.name}</h3>
                    {structure.isDefault && <span className="mt-1 inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">Company default</span>}
                  </div>
                  <span className="text-sm font-bold text-gray-900 dark:text-white">{formatMoney(Number(structure.baseSalary), structure.currencyCode)}</span>
                </div>
                <p className="mt-2 text-xs text-gray-500">{Array.isArray(structure.components) ? structure.components.length : 0} recurring component(s) · {structure.taxRules?.brackets?.length || 0} tax bracket(s)</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => openStructureEditor(structure)} className="rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">Edit Structure</button>
                  {archivingStructureId === structure.id ? (
                    <>
                      <button
                        type="button"
                        disabled={archiveStructureMutation.isPending}
                        onClick={() => archiveStructureMutation.mutate(structure.id)}
                        className="rounded-md bg-rose-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                      >
                        {archiveStructureMutation.isPending ? 'Archiving…' : 'Confirm Archive'}
                      </button>
                      <button
                        type="button"
                        disabled={archiveStructureMutation.isPending}
                        onClick={() => setArchivingStructureId(null)}
                        className="rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-600 dark:border-gray-700 dark:text-gray-300"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={Boolean(structure.isDefault)}
                      title={structure.isDefault ? 'Set another structure as company default before archiving' : 'Archive salary structure'}
                      onClick={() => setArchivingStructureId(structure.id)}
                      className="rounded-md border border-rose-200 px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-rose-900/60 dark:text-rose-300 dark:hover:bg-rose-950/30"
                    >
                      Archive
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}

        {showStructureForm && (
          <form className="space-y-5 border-t border-gray-200 pt-5 dark:border-gray-800" onSubmit={(event) => { event.preventDefault(); structureMutation.mutate(); }}>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{editingStructureId ? 'Edit Salary Structure' : 'New Salary Structure'}</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="payroll-structure-name" className="mb-1 block text-xs font-semibold text-gray-700 dark:text-gray-300">Structure name</label>
                <input id="payroll-structure-name" required maxLength={80} value={structureName} onChange={(event) => setStructureName(event.target.value)} placeholder="e.g. Full-time salaried" className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
              </div>
              <div>
                <label htmlFor="payroll-structure-base" className="mb-1 block text-xs font-semibold text-gray-700 dark:text-gray-300">Default base pay per month</label>
                <input id="payroll-structure-base" required type="number" min="0" step="0.01" value={structureBaseSalary} onChange={(event) => setStructureBaseSalary(event.target.value)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
              </div>
              <div>
                <label htmlFor="payroll-structure-currency" className="mb-1 block text-xs font-semibold text-gray-700 dark:text-gray-300">Currency (ISO 4217)</label>
                <input id="payroll-structure-currency" required minLength={3} maxLength={3} pattern="[A-Za-z]{3}" value={structureCurrency} onChange={(event) => setStructureCurrency(event.target.value.toUpperCase())} placeholder="USD" className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm uppercase dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div><h3 className="text-sm font-semibold text-gray-900 dark:text-white">Recurring pay components</h3><p className="text-[11px] text-gray-500">Amounts may be fixed or a percentage of base pay.</p></div>
                <button type="button" onClick={() => setStructureComponents((items) => [...items, { name: '', type: 'ALLOWANCE', value: '', isPercentage: false, isPreTax: true }])} className="rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 dark:border-gray-700 dark:text-gray-200">Add component</button>
              </div>
              {structureComponents.map((component, index) => (
                <div key={index} className="grid grid-cols-1 items-end gap-2 rounded-lg bg-gray-50 p-3 dark:bg-gray-800/60 sm:grid-cols-[1.5fr_1fr_1fr_auto_auto]">
                  <div><label htmlFor={`payroll-component-name-${index}`} className="mb-1 block text-[11px] text-gray-500">Name</label><input id={`payroll-component-name-${index}`} required maxLength={60} value={component.name} onChange={(event) => setStructureComponents((items) => items.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} placeholder="Housing allowance" className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-2 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-white" /></div>
                  <div><label htmlFor={`payroll-component-type-${index}`} className="mb-1 block text-[11px] text-gray-500">Type</label><select id={`payroll-component-type-${index}`} value={component.type} onChange={(event) => setStructureComponents((items) => items.map((item, i) => i === index ? { ...item, type: event.target.value as EditableComponent['type'] } : item))} className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-2 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-white"><option value="ALLOWANCE">Earning / allowance</option><option value="DEDUCTION">Deduction</option></select></div>
                  <div><label htmlFor={`payroll-component-value-${index}`} className="mb-1 block text-[11px] text-gray-500">Amount</label><input id={`payroll-component-value-${index}`} required type="number" min="0" step="0.01" value={component.value} onChange={(event) => setStructureComponents((items) => items.map((item, i) => i === index ? { ...item, value: event.target.value } : item))} className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-2 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-white" /></div>
                  <label className="flex items-center gap-1.5 pb-2 text-[11px] text-gray-600 dark:text-gray-300"><input type="checkbox" checked={component.isPercentage} onChange={(event) => setStructureComponents((items) => items.map((item, i) => i === index ? { ...item, isPercentage: event.target.checked } : item))} />Percent</label>
                  <button type="button" aria-label={`Remove ${component.name || `component ${index + 1}`}`} onClick={() => setStructureComponents((items) => items.filter((_, i) => i !== index))} className="mb-1 rounded p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
              {structureComponents.map((component, index) => component.type === 'DEDUCTION' && (
                <label key={`pretax-${index}`} className="ml-2 inline-flex items-center gap-2 text-[11px] text-gray-600 dark:text-gray-300">
                  <input type="checkbox" checked={component.isPreTax} onChange={(event) => setStructureComponents((items) => items.map((item, i) => i === index ? { ...item, isPreTax: event.target.checked } : item))} />
                  {component.name || `Deduction ${index + 1}`} reduces taxable pay
                </label>
              ))}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div><h3 className="text-sm font-semibold text-gray-900 dark:text-white">Progressive tax brackets</h3><p className="text-[11px] text-gray-500">Enter monthly taxable-pay thresholds and rates. ZenHR does not assume a country’s tax law. Leave brackets empty for no tax withholding.</p></div>
                <button type="button" onClick={() => setStructureTaxBrackets((items) => [...items, { min: '', max: '', rate: '' }])} className="rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 dark:border-gray-700 dark:text-gray-200">Add bracket</button>
              </div>
              {structureTaxBrackets.map((bracket, index) => (
                <div key={index} className="grid grid-cols-1 items-end gap-2 rounded-lg bg-gray-50 p-3 dark:bg-gray-800/60 sm:grid-cols-[1fr_1fr_1fr_auto]">
                  <div><label htmlFor={`payroll-tax-min-${index}`} className="mb-1 block text-[11px] text-gray-500">Taxable pay from</label><input id={`payroll-tax-min-${index}`} required type="number" min="0" step="0.01" value={bracket.min} onChange={(event) => setStructureTaxBrackets((items) => items.map((item, i) => i === index ? { ...item, min: event.target.value } : item))} className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-2 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-white" /></div>
                  <div><label htmlFor={`payroll-tax-max-${index}`} className="mb-1 block text-[11px] text-gray-500">Through (blank = no limit)</label><input id={`payroll-tax-max-${index}`} type="number" min="0" step="0.01" value={bracket.max} onChange={(event) => setStructureTaxBrackets((items) => items.map((item, i) => i === index ? { ...item, max: event.target.value } : item))} className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-2 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-white" /></div>
                  <div><label htmlFor={`payroll-tax-rate-${index}`} className="mb-1 block text-[11px] text-gray-500">Rate (%)</label><input id={`payroll-tax-rate-${index}`} required type="number" min="0" max="100" step="0.01" value={bracket.rate} onChange={(event) => setStructureTaxBrackets((items) => items.map((item, i) => i === index ? { ...item, rate: event.target.value } : item))} className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-2 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-white" /></div>
                  <button type="button" aria-label={`Remove tax bracket ${index + 1}`} onClick={() => setStructureTaxBrackets((items) => items.filter((_, i) => i !== index))} className="mb-1 rounded p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>

            <label className="flex items-start gap-2 text-xs text-gray-700 dark:text-gray-300"><input type="checkbox" checked={structureIsDefault || (!editingStructureId && structures.length === 0)} disabled={!editingStructureId && structures.length === 0} onChange={(event) => setStructureIsDefault(event.target.checked)} className="mt-0.5" />Use this structure as the company default for employees with no assigned package.</label>
            {structureMutation.error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-xs text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">{structureMutation.error.message}</p>}
            <div className="flex justify-end border-t border-gray-200 pt-4 dark:border-gray-800"><button type="submit" disabled={structureMutation.isPending || !structureName.trim() || structureBaseSalary === '' || !/^[A-Z]{3}$/.test(structureCurrency)} className="rounded-lg bg-primary-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{structureMutation.isPending ? 'Saving…' : editingStructureId ? 'Update Salary Structure' : 'Save Salary Structure'}</button></div>
          </form>
        )}
      </section>

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
            {formatMoney(totalGross, reportCurrency)}
          </p>
          <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
            Base + Allowances + Bonuses
          </span>
        </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs uppercase font-medium">Taxes & Deductions</span>
            <CreditCard className="w-4 h-4" />
          </div>
          <p className="text-2xl font-extrabold text-gray-900 dark:text-white">
            {formatMoney(totalDeductions, reportCurrency)}
          </p>
          <span className="text-xs text-rose-500 font-medium">Statutory Withholdings</span>
        </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs uppercase font-medium">Net Disbursable</span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
            {formatMoney(totalNet, reportCurrency)}
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

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-gray-500">{payslips.length} payslip(s) issued</span>
          {payslips.length > 0 && unpaidPayslipCount > 0 && (
            confirmPeriodPaid ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={markPeriodPaidMutation.isPending}
                  onClick={() => markPeriodPaidMutation.mutate({ month: selectedMonth, year: selectedYear })}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {markPeriodPaidMutation.isPending ? 'Finalizing…' : `Confirm Mark ${unpaidPayslipCount} Paid`}
                </button>
                <button
                  type="button"
                  disabled={markPeriodPaidMutation.isPending}
                  onClick={() => setConfirmPeriodPaid(false)}
                  className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-600 dark:border-gray-700 dark:text-gray-300"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmPeriodPaid(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Mark Period Paid
              </button>
            )
          )}
        </div>
      </div>

      {/* Payslips Table */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <p role="status" className="p-12 text-center text-sm text-gray-500">Loading payslips…</p>
        ) : payslipsError ? (
          <div className="p-12 text-center">
            <p role="alert" className="text-sm text-gray-700 dark:text-gray-200">Could not load payslips for this period.</p>
            <button
              type="button"
              onClick={() => void refetchPayslips()}
              className="mt-3 rounded-lg bg-primary-600 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-700"
            >
              Try again
            </button>
          </div>
        ) : payslips.length === 0 ? (
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
                  <th className="px-4 py-3">Bonuses</th>
                  <th className="px-4 py-3">Deductions</th>
                  <th className="px-4 py-3">Tax</th>
                  <th className="px-4 py-3">Net Salary</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {payslips.map((p: any) => {
                  const isPaid = p.status === 'PAID';
                  const note = p.breakdown?.adjustment?.adjustmentNote;
                  return (
                    <tr key={p.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-900 dark:text-white">
                          {p.employee?.firstName} {p.employee?.lastName}
                        </div>
                        <div className="text-xs text-gray-400">{p.employee?.employeeCode}</div>
                        {note && <div className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400 truncate max-w-[180px]" title={note}>{note}</div>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {p.employee?.department?.name || '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                        {formatMoney(Number(p.baseSalary), p.currencyCode)}
                      </td>
                      <td className="px-4 py-3 text-emerald-600 dark:text-emerald-400">
                        +{formatMoney(Number(p.allowances), p.currencyCode)}
                      </td>
                      <td className="px-4 py-3 text-emerald-600 dark:text-emerald-400">
                        +{formatMoney(Number(p.bonuses || 0), p.currencyCode)}
                      </td>
                      <td className="px-4 py-3 text-rose-500">
                        -{formatMoney(Number(p.deductions), p.currencyCode)}
                      </td>
                      <td className="px-4 py-3 text-rose-500">
                        -{formatMoney(Number(p.taxAmount), p.currencyCode)}
                      </td>
                      <td className="px-4 py-3 font-bold text-gray-900 dark:text-white">
                        {formatMoney(Number(p.netSalary), p.currencyCode)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={p.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            disabled={isPaid}
                            title={isPaid ? 'Paid payslips are locked' : 'Adjust bonus or deductions'}
                            onClick={() => openAdjustModal(p)}
                            className="inline-flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                          >
                            <Edit3 className="h-3 w-3" />
                            Adjust
                          </button>
                          {!isPaid && (
                            <button
                              type="button"
                              disabled={markPayslipPaidMutation.isPending}
                              onClick={() => markPayslipPaidMutation.mutate(p.id)}
                              className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              Mark Paid
                            </button>
                          )}
                          <a
                            href={`${API_PREFIX}/payroll/payslips/${p.id}/pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-primary-700 bg-primary-50 dark:bg-primary-950/40 dark:text-primary-300 rounded hover:bg-primary-100"
                          >
                            <Download className="w-3.5 h-3.5" />
                            PDF
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Adjust Payslip Modal */}
      {adjustingPayslip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-labelledby="adjust-payslip-title" className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-800">
              <div>
                <h3 id="adjust-payslip-title" className="text-lg font-bold text-gray-900 dark:text-white">
                  Adjust Payslip
                </h3>
                <p className="text-xs text-gray-500">
                  {adjustingPayslip.employee?.firstName} {adjustingPayslip.employee?.lastName} · {adjustingPayslip.month}/{adjustingPayslip.year} ({adjustingPayslip.currencyCode || 'USD'})
                </p>
              </div>
              <button
                type="button"
                aria-label="Close payslip adjustment modal"
                onClick={() => setAdjustingPayslip(null)}
                disabled={adjustPayslipMutation.isPending}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none"
              >
                &times;
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                adjustPayslipMutation.mutate();
              }}
              className="mt-4 space-y-4 text-sm"
            >
              <div>
                <label htmlFor="adjust-base-salary" className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Base Salary ({adjustingPayslip.currencyCode || 'USD'})
                </label>
                <input
                  id="adjust-base-salary"
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={adjustBaseSalary}
                  onChange={(e) => setAdjustBaseSalary(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="adjust-bonuses" className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Bonus ({adjustingPayslip.currencyCode || 'USD'})
                  </label>
                  <input
                    id="adjust-bonuses"
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={adjustBonuses}
                    onChange={(e) => setAdjustBonuses(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label htmlFor="adjust-deduction" className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    One-Off Deduction ({adjustingPayslip.currencyCode || 'USD'})
                  </label>
                  <input
                    id="adjust-deduction"
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={adjustDeduction}
                    onChange={(e) => setAdjustDeduction(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="adjust-note" className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Adjustment Note (optional)
                </label>
                <input
                  id="adjust-note"
                  type="text"
                  maxLength={300}
                  value={adjustNote}
                  onChange={(e) => setAdjustNote(e.target.value)}
                  placeholder="e.g. Performance bonus or travel advance deduction"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
              </div>

              <p className="text-[11px] text-gray-500">
                Recurring structure allowances, deductions, and progressive tax brackets will be recalculated automatically.
              </p>

              {adjustPayslipMutation.isError && (
                <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
                  {adjustPayslipMutation.error.message}
                </p>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-gray-200 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setAdjustingPayslip(null)}
                  disabled={adjustPayslipMutation.isPending}
                  className="px-4 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adjustPayslipMutation.isPending}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-primary-600 hover:bg-primary-700 text-white disabled:opacity-50"
                >
                  {adjustPayslipMutation.isPending ? 'Saving…' : 'Save Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
                disabled={executeMutation.isPending}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none"
              >
                &times;
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                executeMutation.mutate({ month: runMonth, year: runYear });
              }}
              className="mt-4 space-y-4 text-sm"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="payroll-run-month" className="block text-xs font-semibold uppercase text-gray-500 mb-1">
                    Month
                  </label>
                  <select
                    id="payroll-run-month"
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
                  <label htmlFor="payroll-run-year" className="block text-xs font-semibold uppercase text-gray-500 mb-1">
                    Year
                  </label>
                  <select
                    id="payroll-run-year"
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

              {executeMutation.isError && (
                <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
                  {executeMutation.error.message}
                </p>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-gray-200 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  disabled={executeMutation.isPending}
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
