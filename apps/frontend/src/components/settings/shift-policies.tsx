'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';

interface Rules {
  startTime: string;
  endTime: string;
  workDays: number[];
  breakDuration: number;
  requiredMinutes: number;
  halfDayMinutes: number;
  fullDayMinutes: number;
  overtimeEnabled: boolean;
  overtimeCapMinutes: number | null;
}

interface Shift extends Pick<Rules, 'startTime' | 'endTime' | 'workDays' | 'breakDuration'> {
  id: string;
  name: string;
  isDefault?: boolean;
  revisions: (Rules & { effectiveDate: string })[];
}

interface EmployeeShiftSchedule {
  timezone: string;
  today: string;
  tomorrow: string;
  currentShift: {
    shiftId: string;
    shiftName: string;
    isDefaultFallback: boolean;
    effectiveFrom: string | null;
    startTime: string;
    endTime: string;
    workDays: number[];
    breakDuration: number;
    requiredMinutes: number | null;
    halfDayMinutes: number | null;
    fullDayMinutes: number | null;
    overtimeEnabled: boolean;
    overtimeCapMinutes: number | null;
  } | null;
  upcomingAssignments: {
    id: string;
    shiftId: string;
    shiftName: string;
    effectiveDate: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    startTime: string;
    endTime: string;
    workDays: number[];
    breakDuration: number;
    status: 'SCHEDULED';
  }[];
  upcomingCompanyRevisions: {
    id: string;
    shiftId: string;
    shiftName: string;
    effectiveDate: string;
    startTime: string;
    endTime: string;
    workDays: number[];
    breakDuration: number;
  }[];
}

const input =
  'w-full rounded border border-zinc-300 px-2.5 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800';
const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const minuteFields = [
  ['breakDuration', 'Unpaid break'],
  ['requiredMinutes', 'Required net work'],
  ['halfDayMinutes', 'Minimum for half day'],
  ['fullDayMinutes', 'Minimum for full day'],
  ['overtimeCapMinutes', 'Overtime cap (optional)'],
] as const;

function formatWorkDays(workDays?: number[] | null): string {
  if (!Array.isArray(workDays) || workDays.length === 0) return '—';
  const sorted = [...workDays].sort((a, b) => a - b);
  if (sorted.length === 5 && sorted[0] === 1 && sorted[4] === 5) return 'Mon – Fri';
  if (sorted.length === 6 && sorted[0] === 1 && sorted[5] === 6) return 'Mon – Sat';
  return sorted.map((d) => days[d - 1] ?? String(d)).join(', ');
}

function resolveScheduleForDate(shift: Shift, targetDate: string) {
  const revisions = Array.isArray(shift.revisions) ? shift.revisions : [];
  const applicableRevision = revisions
    .filter((rev) => typeof rev?.effectiveDate === 'string' && rev.effectiveDate.slice(0, 10) <= targetDate)
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0];
  return {
    startTime: applicableRevision?.startTime ?? shift.startTime,
    endTime: applicableRevision?.endTime ?? shift.endTime,
    workDays: Array.isArray(applicableRevision?.workDays)
      ? applicableRevision.workDays
      : Array.isArray(shift.workDays)
        ? shift.workDays
        : [],
    breakDuration: applicableRevision?.breakDuration ?? shift.breakDuration,
    revisionEffectiveDate: applicableRevision?.effectiveDate?.slice(0, 10) ?? null,
  };
}

export function ShiftPolicies({
  canEdit,
  canAssign = true,
  tenantId,
  employeeId,
}: {
  canEdit: boolean;
  canAssign?: boolean;
  tenantId: string;
  employeeId?: string;
}) {
  const client = useQueryClient();
  const [selected, setSelected] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [pendingReplacement, setPendingReplacement] = useState(false);

  const shiftsKey = ['attendance-shifts', tenantId];
  const employeeShiftsKey = ['employee-shifts', tenantId, employeeId];

  const shifts = useQuery({
    queryKey: shiftsKey,
    queryFn: () => api.get<Shift[]>('/attendance/shifts'),
    enabled: canEdit || (Boolean(employeeId) && canAssign),
  });

  const employeeSchedule = useQuery({
    queryKey: employeeShiftsKey,
    queryFn: () => api.get<EmployeeShiftSchedule>(`/attendance/employees/${employeeId}/shifts`),
    enabled: Boolean(employeeId),
  });

  const rawSchedule = employeeSchedule.data;
  const isValidSchedule =
    Boolean(rawSchedule) &&
    typeof rawSchedule === 'object' &&
    !Array.isArray(rawSchedule) &&
    Array.isArray(rawSchedule.upcomingAssignments) &&
    Array.isArray(rawSchedule.upcomingCompanyRevisions);
  const scheduleData = isValidSchedule ? rawSchedule : null;
  const hasMalformedSchedule =
    Boolean(employeeId) &&
    !employeeSchedule.isLoading &&
    !employeeSchedule.isError &&
    rawSchedule !== undefined &&
    !isValidSchedule;

  useEffect(() => {
    if (!effectiveDate && scheduleData?.tomorrow) {
      setEffectiveDate(scheduleData.tomorrow);
    }
  }, [effectiveDate, scheduleData?.tomorrow]);

  const fallbackTomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const effectiveTargetDate = effectiveDate || scheduleData?.tomorrow || fallbackTomorrow;
  const minSelectableDate = scheduleData?.today || new Date().toISOString().slice(0, 10);

  const shiftsList = Array.isArray(shifts.data) ? shifts.data : [];
  const shift = shiftsList.find(({ id }) => id === selected);
  const latest = Array.isArray(shift?.revisions) ? shift.revisions[0] : undefined;
  const selectedSchedule = shift ? resolveScheduleForDate(shift, effectiveTargetDate) : null;

  // Build distinguishable labels for duplicate shift names/schedules
  const labelSignatureCounts = new Map<string, number>();
  for (const item of shiftsList) {
    const sched = resolveScheduleForDate(item, effectiveTargetDate);
    const sig = `${item.name}|${sched.startTime}-${sched.endTime}|${item.isDefault ? 'default' : 'custom'}`;
    labelSignatureCounts.set(sig, (labelSignatureCounts.get(sig) ?? 0) + 1);
  }

  const save = useMutation({
    mutationFn: (body: Rules & { name?: string; effectiveDate: string }) =>
      api.post(shift ? `/attendance/shifts/${shift.id}/revisions` : '/attendance/shifts', body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: shiftsKey });
      if (employeeId) {
        void client.invalidateQueries({ queryKey: employeeShiftsKey });
      }
    },
  });

  const assign = useMutation({
    mutationFn: (replaceExisting: boolean) =>
      api.post(`/attendance/shifts/${selected}/assign/${employeeId}`, {
        effectiveDate: effectiveTargetDate,
        replaceExisting,
      }),
    onSuccess: () => {
      setPendingReplacement(false);
      void client.invalidateQueries({ queryKey: employeeShiftsKey });
      void client.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        setPendingReplacement(true);
      } else {
        setPendingReplacement(false);
      }
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const cap = form.get('overtimeCapMinutes');
    save.mutate({
      ...(shift ? {} : { name: String(form.get('name')) }),
      effectiveDate: String(form.get('effectiveDate')),
      startTime: String(form.get('startTime')),
      endTime: String(form.get('endTime')),
      workDays: form.getAll('workDays').map(Number),
      breakDuration: Number(form.get('breakDuration')),
      requiredMinutes: Number(form.get('requiredMinutes')),
      halfDayMinutes: Number(form.get('halfDayMinutes')),
      fullDayMinutes: Number(form.get('fullDayMinutes')),
      overtimeEnabled: form.has('overtimeEnabled'),
      overtimeCapMinutes: cap ? Number(cap) : null,
    });
  }

  return (
    <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">
          {employeeId ? 'Shift & Schedule' : 'Shift and attendance policies'}
        </h2>
        {scheduleData?.timezone && (
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
            Timezone: {scheduleData.timezone}
          </span>
        )}
      </div>

      {/* Employee Current & Upcoming Shift Visibility */}
      {employeeId && (
        <div className="space-y-3">
          {employeeSchedule.isLoading ? (
            <p className="text-xs text-zinc-500">Loading employee schedule...</p>
          ) : employeeSchedule.isError ? (
            <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
              {employeeSchedule.error.message}
            </p>
          ) : hasMalformedSchedule ? (
            <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
              Unable to display employee shift schedule: unexpected response format.
            </p>
          ) : (
            <>
              {/* Current Shift */}
              <div className="rounded-lg border border-zinc-200 bg-zinc-50/70 p-3.5 dark:border-zinc-800 dark:bg-zinc-950/50">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    Current Shift
                  </span>
                  {scheduleData?.currentShift && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                      {scheduleData.currentShift.isDefaultFallback ? 'Company Default' : 'Active'}
                    </span>
                  )}
                </div>
                {scheduleData?.currentShift ? (
                  <div className="mt-2 space-y-1 text-xs">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {scheduleData.currentShift.shiftName}
                    </p>
                    <p className="text-zinc-600 dark:text-zinc-300">
                      {scheduleData.currentShift.startTime} – {scheduleData.currentShift.endTime} •{' '}
                      {formatWorkDays(scheduleData.currentShift.workDays)} • Break{' '}
                      {scheduleData.currentShift.breakDuration}m
                    </p>
                    <p className="text-zinc-500 dark:text-zinc-400">
                      Effective from:{' '}
                      {scheduleData.currentShift.effectiveFrom
                        ? scheduleData.currentShift.effectiveFrom.slice(0, 10)
                        : 'Since onboarding (Default)'}
                    </p>
                    {scheduleData.currentShift.requiredMinutes !== null && (
                      <p className="text-zinc-500 dark:text-zinc-400">
                        Requirements: {scheduleData.currentShift.requiredMinutes}m net work • Half day{' '}
                        {scheduleData.currentShift.halfDayMinutes}m • Full day{' '}
                        {scheduleData.currentShift.fullDayMinutes}m • Overtime{' '}
                        {scheduleData.currentShift.overtimeEnabled ? 'Enabled' : 'Disabled'}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-zinc-500">No active shift configured.</p>
                )}
              </div>

              {/* Upcoming Employee Assignments */}
              <div className="rounded-lg border border-zinc-200 bg-zinc-50/70 p-3.5 dark:border-zinc-800 dark:bg-zinc-950/50">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  Upcoming Employee Assignments
                </span>
                {!scheduleData?.upcomingAssignments.length ? (
                  <p className="mt-1.5 text-xs text-zinc-500">No upcoming shift changes scheduled.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {scheduleData.upcomingAssignments.map((item) => (
                      <li
                        key={item.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-900"
                      >
                        <div>
                          <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                            {item.shiftName} ({item.startTime} – {item.endTime})
                          </p>
                          <p className="text-zinc-500 dark:text-zinc-400">
                            Effective {item.effectiveDate} • {formatWorkDays(item.workDays)} • Break{' '}
                            {item.breakDuration}m
                          </p>
                        </div>
                        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                          Scheduled
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Upcoming Company Shift Revisions (distinct from employee assignments) */}
              {Boolean(scheduleData?.upcomingCompanyRevisions.length) && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3.5 dark:border-amber-900/50 dark:bg-amber-950/20">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                    Upcoming Company Shift Policy Revisions
                  </span>
                  <ul className="mt-2 space-y-1.5 text-xs text-amber-900 dark:text-amber-200">
                    {scheduleData!.upcomingCompanyRevisions.map((rev) => (
                      <li key={rev.id}>
                        <strong>{rev.shiftName}</strong> policy updates on {rev.effectiveDate}:{' '}
                        {rev.startTime} – {rev.endTime} ({formatWorkDays(rev.workDays)}, Break{' '}
                        {rev.breakDuration}m)
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Assignment Controls (CEO / HR Manager) or Policy Editor (CEO) */}
      {(canEdit || (Boolean(employeeId) && canAssign)) && (
        <div className="space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          {employeeId && (
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Assign or Schedule Shift
            </h3>
          )}
          {shifts.isError && (
            <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
              {shifts.error.message}
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Shift
              <select
                className={`${input} mt-1`}
                value={selected}
                onChange={(event) => {
                  setSelected(event.target.value);
                  setPendingReplacement(false);
                  save.reset();
                  assign.reset();
                }}
              >
                <option value="">{canEdit ? 'New shift' : 'Select an existing shift'}</option>
                {shiftsList.map((item) => {
                  const sched = resolveScheduleForDate(item, effectiveTargetDate);
                  const sig = `${item.name}|${sched.startTime}-${sched.endTime}|${item.isDefault ? 'default' : 'custom'}`;
                  const isDup = (labelSignatureCounts.get(sig) ?? 0) > 1;
                  const label = `${item.name} (${sched.startTime}–${sched.endTime})${item.isDefault ? ' • Default' : ''}${isDup ? ` (#${item.id.slice(-4)})` : ''}`;
                  return (
                    <option key={item.id} value={item.id}>
                      {label}
                    </option>
                  );
                })}
              </select>
            </label>

            {employeeId && (
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Effective Date
                <input
                  type="date"
                  min={minSelectableDate}
                  value={effectiveTargetDate}
                  onChange={(e) => {
                    setEffectiveDate(e.target.value);
                    setPendingReplacement(false);
                    assign.reset();
                  }}
                  className={`${input} mt-1`}
                />
              </label>
            )}
          </div>

          {selectedSchedule && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Schedule on {effectiveTargetDate}: {selectedSchedule.startTime} –{' '}
              {selectedSchedule.endTime} ({formatWorkDays(selectedSchedule.workDays)}, Break{' '}
              {selectedSchedule.breakDuration}m)
              {selectedSchedule.revisionEffectiveDate
                ? ` • Policy revision effective ${selectedSchedule.revisionEffectiveDate}`
                : ''}
            </p>
          )}

          {employeeId && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!shift || assign.isPending}
                onClick={() => assign.mutate(false)}
                className="rounded-lg bg-indigo-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-600 disabled:opacity-50"
              >
                {assign.isPending ? 'Scheduling...' : `Assign effective ${effectiveTargetDate}`}
              </button>
              {pendingReplacement && (
                <button
                  type="button"
                  disabled={!shift || assign.isPending}
                  onClick={() => assign.mutate(true)}
                  className="rounded-lg bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-amber-500 disabled:opacity-50"
                >
                  Confirm Replacement for {effectiveTargetDate}
                </button>
              )}
            </div>
          )}

          {assign.isSuccess && (
            <p role="status" className="text-xs text-emerald-700 dark:text-emerald-400">
              {assign.data && (assign.data as { idempotent?: boolean }).idempotent
                ? `Shift is already assigned for ${effectiveTargetDate}.`
                : `Shift assignment saved effective ${effectiveTargetDate}.`}
            </p>
          )}
          {assign.isError && (
            <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
              {assign.error.message}
            </p>
          )}
        </div>
      )}

      {canEdit && (
        <form key={selected} onSubmit={submit} className="grid gap-3 border-t border-zinc-200 pt-4 sm:grid-cols-2 dark:border-zinc-800">
          {!shift && (
            <label>
              Shift name
              <input name="name" className={input} required maxLength={100} />
            </label>
          )}
          <label>
            Effective date
            <input name="effectiveDate" className={input} type="date" required />
          </label>
          <label>
            Start time
            <input name="startTime" className={input} type="time" defaultValue={latest?.startTime ?? shift?.startTime} required />
          </label>
          <label>
            End time
            <input name="endTime" className={input} type="time" defaultValue={latest?.endTime ?? shift?.endTime} required />
          </label>
          <fieldset className="sm:col-span-2">
            <legend>Working days</legend>
            <div className="flex flex-wrap gap-3">
              {days.map((day, index) => (
                <label key={day} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    name="workDays"
                    value={index + 1}
                    defaultChecked={(latest?.workDays ?? shift?.workDays ?? [1, 2, 3, 4, 5]).includes(index + 1)}
                  />
                  {day}
                </label>
              ))}
            </div>
          </fieldset>
          {minuteFields.map(([name, label]) => (
            <label key={name}>
              {label} (minutes)
              <input
                name={name}
                className={input}
                type="number"
                min={name === 'breakDuration' ? 0 : 1}
                max={name === 'overtimeCapMinutes' ? 1440 : 1439}
                defaultValue={latest?.[name] ?? (name === 'breakDuration' ? shift?.breakDuration : undefined)}
                required={name !== 'overtimeCapMinutes'}
              />
            </label>
          ))}
          <label className="flex items-center gap-2">
            <input name="overtimeEnabled" type="checkbox" defaultChecked={latest?.overtimeEnabled ?? true} />
            Count eligible minutes above required net work as overtime
          </label>
          {save.isError && (
            <p role="alert" className="sm:col-span-2 text-rose-600 dark:text-rose-300">
              {save.error.message}
            </p>
          )}
          {save.isSuccess && (
            <p role="status" className="sm:col-span-2 text-emerald-700 dark:text-emerald-400">
              Shift policy scheduled.
            </p>
          )}
          <button
            type="submit"
            disabled={save.isPending}
            className="justify-self-start rounded bg-indigo-700 px-3 py-2 text-white disabled:opacity-50"
          >
            Schedule shift policy
          </button>
        </form>
      )}
    </section>
  );
}
