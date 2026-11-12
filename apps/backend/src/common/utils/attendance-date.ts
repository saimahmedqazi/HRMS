import type { PrismaService } from '../prisma/prisma.service';

export interface AttendanceTime {
  date: Date;
  hour: number;
  minute: number;
}

// Attendance dates are stored as PostgreSQL date values, represented at UTC midnight.
export function getAttendanceDay(now: Date, timeZone = 'UTC'): AttendanceTime {
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  };
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en-US', { ...options, timeZone });
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    formatter = new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' });
  }

  const parts = Object.fromEntries(formatter.formatToParts(now).map(({ type, value }) => [type, value]));
  return {
    date: new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day))),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

export function previousAttendanceDate(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - 1));
}

export async function getCompanyAttendanceTime(prisma: Pick<PrismaService, 'company'>, companyId: string, now: Date) {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { timezone: true } });
  return getAttendanceDay(now, company?.timezone);
}
