import { Injectable } from '@nestjs/common';
import { UserRole, DataScope } from '@prisma/client';
import { AuthenticatedUser } from '../decorators/current-user.decorator';

export interface DataScopeFilter {
  companyId?: string;
  departmentId?: string;
  teamId?: string;
  id?: string;          // for SELF scope — matches employeeId
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
    'subscriptions',
    'users',
    'audit-logs',
    'support-mode',
    'ai-quotas',
    'settings',
  ],
  [UserRole.OPERATION_MANAGER]: [
    'dashboard',
    'companies',
    'subscriptions',
    'reports',
  ],
  [UserRole.COMPANY_ADMIN]: [
    'dashboard',
    'employees',
    'departments',
    'teams',
    'attendance',
    'leave',
    'payroll',
    'resources',
    'billing',
    'ai-assistant',
    'settings',
  ],
  [UserRole.HR_MANAGER]: [
    'dashboard',
    'employees',
    'departments',
    'attendance',
    'leave',
    'payroll',
    'bulk-import',
    'ai-assistant',
    'reports',
  ],
  [UserRole.DEPARTMENT_MANAGER]: [
    'dashboard',
    'team-members',
    'attendance',
    'leave-approvals',
    'payroll-view',
    'resources',
    'ai-assistant',
  ],
  [UserRole.TEAM_LEAD]: [
    'dashboard',
    'team-members',
    'attendance',
    'leave-approvals',
    'resources',
    'ai-assistant',
  ],
  [UserRole.EMPLOYEE]: [
    'dashboard',
    'my-attendance',
    'my-leave',
    'my-payslips',
    'my-profile',
    'work-timer',
    'ai-assistant',
    'resources',
  ],
};

@Injectable()
export class DataScopeService {
  /**
   * Returns a Prisma `where` fragment that restricts queries to the user's data scope.
   * Services should merge this into their query's `where` clause.
   */
  applyScope(
    user: AuthenticatedUser,
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
            : {}),
        };

      case DataScope.TEAM:
        // Team Lead — scoped to their team
        return {
          companyId: user.companyId ?? undefined,
          ...(employeeContext?.teamId ? { teamId: employeeContext.teamId } : {}),
        };

      case DataScope.SELF:
        // Employee — own records only
        return {
          companyId: user.companyId ?? undefined,
          ...(employeeContext?.employeeId ? { id: employeeContext.employeeId } : {}),
        };

      default:
        return { companyId: user.companyId ?? undefined };
    }
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
