import { CompanyStatus, EmployeeStatus } from '@prisma/client';

export function isInactiveAccount(user: {
  deletedAt?: Date | null;
  company?: { status: CompanyStatus } | null;
  employee?: { status: EmployeeStatus; deletedAt: Date | null } | null;
}): boolean {
  return Boolean(
    user.deletedAt ||
    user.company?.status === CompanyStatus.SUSPENDED ||
    user.employee?.deletedAt ||
    user.employee?.status === EmployeeStatus.SUSPENDED ||
    user.employee?.status === EmployeeStatus.TERMINATED ||
    user.employee?.status === EmployeeStatus.RESIGNED
  );
}
