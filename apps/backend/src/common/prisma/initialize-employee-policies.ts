import type { Prisma } from '@prisma/client';

export async function initializeEmployeePolicies(
  tx: Prisma.TransactionClient,
  companyId: string,
  employeeId: string,
): Promise<void> {
  const now = new Date();
  const defaultShift = await tx.shift.findFirst({
    where: { companyId, isDefault: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true },
  });
  if (defaultShift) {
    await tx.employeeShift.create({
      data: { companyId, employeeId, shiftId: defaultShift.id, effectiveFrom: now },
    });
  }

  const leaveTypes = await tx.leaveTypeSetting.findMany({
    where: { companyId, isActive: true },
    select: { leaveType: true, annualAllocation: true },
  });
  if (leaveTypes.length > 0) {
    await tx.leaveBalance.createMany({
      data: leaveTypes.map(({ leaveType, annualAllocation }) => ({
        companyId, employeeId, leaveType, year: now.getFullYear(), allocated: annualAllocation,
      })),
    });
  }
}
