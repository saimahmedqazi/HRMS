import { Injectable } from '@nestjs/common';
import { UserRole, DataScope, Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

export interface DataScopeFilter {
  companyId?: string;
  departmentId?: string;
  teamId?: string;
  id?: string | Prisma.StringFilter;
  userId?: string;      // alternative for SELF scope
}

/**
 * Maps each role to its default data scope.
 * PLATFORM scope = no tenant restriction (Super Admin, Operation Manager)
 * COMPANY scope = entire tenant company
 * DEPARTMENT scope = single department
 * TEAM scope = single team
 * SELF scope = own records only
 */
export const ROLE_SCOPE_MAP: Record<UserRole, DataScope> = {
  [UserRole.SUPER_ADMIN]: DataScope.PLATFORM,
  [UserRole.OPERATION_MANAGER]: DataScope.PLATFORM,
  [UserRole.COMPANY_ADMIN]: DataScope.COMPANY,
  [UserRole.HR_MANAGER]: DataScope.COMPANY,
  [UserRole.DEPARTMENT_MANAGER]: DataScope.DEPARTMENT,
  [UserRole.TEAM_LEAD]: DataScope.TEAM,
  [UserRole.EMPLOYEE]: DataScope.SELF,
};

/**
 * Allowed modules manifest per role.
 * Frontend renders sidebar exclusively based on this server-driven list.
 */
export const ROLE_MODULE_MAP: Record<UserRole, string[]> = {
  [UserRole.SUPER_ADMIN]: [
    'dashboard',
    'companies',
    'support-mode',
    'billing',
    'settings',
    'my-profile',
  ],
  [UserRole.OPERATION_MANAGER]: [
    'dashboard',
    'companies',
    'resources',
    'billing',
    'settings',
    'my-profile',
  ],
  [UserRole.COMPANY_ADMIN]: [
    'dashboard',
    'employees',
    'departments',
    'attendance',
    'leave',
    'leave-approvals',
    'payroll',
    'resources',
    'billing',
    'ai-assistant',
    'settings',
    'my-profile',
  ],
  [UserRole.HR_MANAGER]: [
    'dashboard',
    'employees',
    'departments',
    'attendance',
    'leave',
    'leave-approvals',
    'payroll',
    'bulk-import',
    'resources',
    'ai-assistant',
    'settings',
    'my-profile',
  ],
  [UserRole.DEPARTMENT_MANAGER]: [
    'dashboard',
    'team-members',
    'attendance',
    'leave-approvals',
    'payroll-view',
    'resources',
    'ai-assistant',
    'settings',
    'my-profile',
  ],
  [UserRole.TEAM_LEAD]: [
    'dashboard',
    'team-members',
    'attendance',
    'leave-approvals',
    'resources',
    'ai-assistant',
    'settings',
    'my-profile',
  ],
  [UserRole.EMPLOYEE]: [
    'dashboard',
    'my-attendance',
    'my-leave',
    'my-payslips',
    'work-timer',
    'ai-assistant',
    'resources',
    'settings',
    'my-profile',
  ],
};

@Injectable()
export class DataScopeService {
  /**
   * Returns a Prisma `where` fragment that restricts queries to the user's data scope.
   * Services should merge this into their query's `where` clause.
   */
  applyScope(
    user: Pick<AuthenticatedUser, 'role' | 'companyId'>,
    employeeContext?: { departmentId?: string; teamId?: string; employeeId?: string },
  ): DataScopeFilter {
    const role = user.role as UserRole;
    const scope = ROLE_SCOPE_MAP[role] || DataScope.SELF;

    switch (scope) {
      case DataScope.PLATFORM:
        // No restriction — Super Admin and Operation Manager see everything
        return {};

      case DataScope.COMPANY:
        // Company Admin and HR Manager — scoped to their company
        return { companyId: user.companyId ?? undefined };

      case DataScope.DEPARTMENT:
        // Department Manager — scoped to their department
        return {
          companyId: user.companyId ?? undefined,
          ...(employeeContext?.departmentId
            ? { departmentId: employeeContext.departmentId }
            : { id: employeeContext?.employeeId ?? { in: [] } }),
        };

      case DataScope.TEAM:
        // Team Lead — scoped to their team
        return {
          companyId: user.companyId ?? undefined,
          ...(employeeContext?.teamId
            ? { teamId: employeeContext.teamId }
            : { id: employeeContext?.employeeId ?? { in: [] } }),
        };

      case DataScope.SELF:
        // Employee — own records only
        return {
          companyId: user.companyId ?? undefined,
          id: employeeContext?.employeeId ?? { in: [] },
        };

      default:
        return { companyId: user.companyId ?? undefined };
    }
  }

  async resolveEmployeeScope(
    prisma: PrismaService,
    companyId: string,
    user: Pick<AuthenticatedUser, 'id' | 'sub' | 'role'>,
  ): Promise<DataScopeFilter & { companyId: string; deletedAt: null }> {
    const scope = this.getScope(user.role as UserRole);
    const userId = user.id || user.sub;
    const caller = userId && scope !== DataScope.PLATFORM && scope !== DataScope.COMPANY
      ? await prisma.employee.findFirst({
          where: { companyId, userId, deletedAt: null },
          select: { id: true, departmentId: true, teamId: true },
        })
      : null;

    return {
      ...this.applyScope({ role: user.role, companyId }, {
        departmentId: caller?.departmentId ?? undefined,
        teamId: caller?.teamId ?? undefined,
        employeeId: caller?.id,
      }),
      companyId,
      deletedAt: null,
    };
  }

  /**
   * Returns the allowed modules manifest for a given role.
   * Used by the frontend to render the role-adaptive sidebar.
   */
  getAllowedModules(role: UserRole): string[] {
    return ROLE_MODULE_MAP[role] || [];
  }

  /**
   * Returns the data scope for a given role.
   */
  getScope(role: UserRole): DataScope {
    return ROLE_SCOPE_MAP[role] || DataScope.SELF;
  }
}
