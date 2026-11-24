import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

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
  revisions: (Rules & { effectiveDate: string })[];
}

const input = 'w-full rounded border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-800';
const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const minuteFields = [
  ['breakDuration', 'Unpaid break'],
  ['requiredMinutes', 'Required net work'],
  ['halfDayMinutes', 'Minimum for half day'],
  ['fullDayMinutes', 'Minimum for full day'],
  ['overtimeCapMinutes', 'Overtime cap (optional)'],
] as const;

export function ShiftPolicies({ canEdit, tenantId, employeeId }: { canEdit: boolean; tenantId: string; employeeId?: string }) {
  const client = useQueryClient();
  const [selected, setSelected] = useState('');
  const key = ['attendance-shifts', tenantId];
  const shifts = useQuery({ queryKey: key, queryFn: () => api.get<Shift[]>('/attendance/shifts') });
  const shift = shifts.data?.find(({ id }) => id === selected);
  const latest = shift?.revisions[0];
  const save = useMutation({
    mutationFn: (body: Rules & { name?: string; effectiveDate: string }) =>
      api.post(shift ? `/attendance/shifts/${shift.id}/revisions` : '/attendance/shifts', body),
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
  });
  const assign = useMutation({
    mutationFn: () => api.post(`/attendance/shifts/${selected}/assign/${employeeId}`, {}),
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
    <section className="space-y-4 rounded-xl border border-zinc-200 p-4 text-sm dark:border-zinc-800">
      <h2 className="font-semibold">{employeeId ? 'Shift assignment' : 'Shift and attendance policies'}</h2>
      {shifts.isError && <p role="alert">{shifts.error.message}</p>}
      <label className="block max-w-sm">Shift
        <select className={input} value={selected} onChange={(event) => {
          setSelected(event.target.value);
          save.reset();
          assign.reset();
        }}>
          <option value="">{canEdit ? 'New shift' : 'Select an existing shift'}</option>
          {shifts.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      {latest && <p>Latest scheduled revision starts {latest.effectiveDate.slice(0, 10)}.</p>}
      {employeeId && (
        <button type="button" disabled={!shift || assign.isPending} onClick={() => assign.mutate()}
          className="rounded bg-indigo-700 px-3 py-2 text-white disabled:opacity-50">Assign from tomorrow</button>
      )}
      {assign.isSuccess && <p role="status">Shift assignment scheduled.</p>}
      {assign.isError && <p role="alert">{assign.error.message}</p>}
      {canEdit && (
        <form key={selected} onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          {!shift && <label>Shift name<input name="name" className={input} required maxLength={100} /></label>}
          <label>Effective date<input name="effectiveDate" className={input} type="date" required /></label>
          <label>Start time<input name="startTime" className={input} type="time" defaultValue={latest?.startTime ?? shift?.startTime} required /></label>
          <label>End time<input name="endTime" className={input} type="time" defaultValue={latest?.endTime ?? shift?.endTime} required /></label>
          <fieldset className="sm:col-span-2">
            <legend>Working days</legend>
            <div className="flex flex-wrap gap-3">
              {days.map((day, index) => <label key={day} className="flex items-center gap-1">
                <input type="checkbox" name="workDays" value={index + 1} defaultChecked={(latest?.workDays ?? shift?.workDays ?? [1, 2, 3, 4, 5]).includes(index + 1)} />{day}
              </label>)}
            </div>
          </fieldset>
          {minuteFields.map(([name, label]) => <label key={name}>{label} (minutes)
            <input name={name} className={input} type="number" min={name === 'breakDuration' ? 0 : 1} max={name === 'overtimeCapMinutes' ? 1440 : 1439}
              defaultValue={latest?.[name] ?? (name === 'breakDuration' ? shift?.breakDuration : undefined)} required={name !== 'overtimeCapMinutes'} />
          </label>)}
          <label className="flex items-center gap-2"><input name="overtimeEnabled" type="checkbox" defaultChecked={latest?.overtimeEnabled ?? true} /> Count eligible minutes above required net work as overtime</label>
          {save.isError && <p role="alert" className="sm:col-span-2 text-rose-600 dark:text-rose-300">{save.error.message}</p>}
          {save.isSuccess && <p role="status" className="sm:col-span-2">Shift policy scheduled.</p>}
          <button type="submit" disabled={save.isPending} className="justify-self-start rounded bg-indigo-700 px-3 py-2 text-white disabled:opacity-50">Schedule shift policy</button>
        </form>
      )}
    </section>
  );
}
