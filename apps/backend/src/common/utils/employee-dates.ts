import { isISO8601 } from 'class-validator';

export function parseEmployeeDate(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value) || !isISO8601(value, { strict: true, strictSeparator: true })) {
    return undefined;
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

export function getProbationEndDate(hireDate: Date): Date {
  return new Date(hireDate.getTime() + 90 * 24 * 60 * 60 * 1000);
}
