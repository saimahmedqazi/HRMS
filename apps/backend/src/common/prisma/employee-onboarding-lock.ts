import { Prisma } from '@prisma/client';

export async function lockEmployeeOnboarding(tx: Prisma.TransactionClient, companyId: string): Promise<void> {
  // Serialize employee creation for this company while allowing foreign-key checks on its row.
  await tx.$queryRaw`SELECT "id" FROM "companies" WHERE "id" = ${companyId} FOR NO KEY UPDATE`;
}
