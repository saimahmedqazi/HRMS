import type { Prisma } from '@prisma/client';

export async function lockEmployeeLeave(tx: Prisma.TransactionClient, companyId: string, employeeId: string) {
  const key = `leave:${companyId}:${employeeId}`;
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}
