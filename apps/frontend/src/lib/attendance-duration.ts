export function formatWorkDuration(record: {
  workMinutes?: number | null;
  checkInTime?: string | null;
  checkOutTime?: string | null;
}): string {
  if (!record.checkOutTime && !record.workMinutes) {
    return record.checkInTime ? 'In progress' : '—';
  }

  const elapsed = record.checkInTime && record.checkOutTime
    ? (Date.parse(record.checkOutTime) - Date.parse(record.checkInTime)) / 60000
    : 0;
  const minutes = Math.max(0, Math.round(record.workMinutes ?? elapsed));
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}
