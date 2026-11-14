import { CompanyStatus, EmployeeStatus } from '@prisma/client';

export function isInactiveEmployeeStatus(status?: EmployeeStatus): boolean {
  return status === EmployeeStatus.SUSPENDED ||
    status === EmployeeStatus.TERMINATED ||
    status === EmployeeStatus.RESIGNED;
}

export function isInactiveAccount(user: {
  deletedAt?: Date | null;
  company?: { status: CompanyStatus } | null;
  employee?: { status: EmployeeStatus; deletedAt: Date | null } | null;
}): boolean {
  return Boolean(
    user.deletedAt ||
    user.company?.status === CompanyStatus.SUSPENDED ||
    user.employee?.deletedAt ||
    isInactiveEmployeeStatus(user.employee?.status)
  );
}
