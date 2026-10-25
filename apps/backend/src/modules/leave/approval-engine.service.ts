import { Injectable, ForbiddenException, BadRequestException } from '@nestjs/common';
import { ApprovalStatus, UserRole } from '@prisma/client';

export interface RequesterContext {
  id: string; // employeeId
  userId: string;
  status: string;
  hireDate: Date;
  role: UserRole;
  leadUserId?: string | null;
  deptManagerUserId?: string | null;
  reportingManagerUserId?: string | null;
}

export interface ApproverResolution {
  step1ApproverId: string | null;
  step1Status: ApprovalStatus;
  step2ApproverId: string | null;
  step2Status: ApprovalStatus;
}

@Injectable()
export class ApprovalEngineService {
  /**
   * Asserts whether an employee is eligible to request leave.
   * Hard probation rule: EMPLOYEE role on ON_PROBATION is blocked for the first 90 days from hireDate.
   */
  assertCanRequestLeave(employee: {
    status: string;
    hireDate: Date;
    role?: UserRole;
  }): void {
    if (
      employee.status === 'SUSPENDED' ||
      employee.status === 'TERMINATED' ||
      employee.status === 'RESIGNED'
    ) {
      throw new ForbiddenException('Inactive employee accounts cannot request leave.');
    }

    if (employee.role === UserRole.EMPLOYEE && employee.status === 'ON_PROBATION') {
      const hireTime = new Date(employee.hireDate).getTime();
      const probationEnd = new Date(hireTime + 90 * 24 * 60 * 60 * 1000);
      const now = new Date();

      if (now < probationEnd) {
        const dateStr = probationEnd.toISOString().split('T')[0];
        throw new ForbiddenException(
          `Employees on active probation cannot request leave until ${dateStr}.`,
        );
      }
    }
  }

  /**
   * Resolves the 2-step approval hierarchy dynamically based on the employee's role and reporting line.
   */
  resolveApprovers(
    requester: RequesterContext,
    hrManagerUserId?: string | null,
    companyAdminUserId?: string | null,
  ): ApproverResolution {
    let step1ApproverId: string | null = null;
    let step1Status: ApprovalStatus = ApprovalStatus.PENDING;
    let step2ApproverId: string | null = null;
    let step2Status: ApprovalStatus = ApprovalStatus.PENDING;

    switch (requester.role) {
      case UserRole.EMPLOYEE: {
        // Step 1: Team Lead -> Reporting Manager -> Dept Manager -> HR
        step1ApproverId =
          requester.leadUserId ||
          requester.reportingManagerUserId ||
          requester.deptManagerUserId ||
          hrManagerUserId ||
          companyAdminUserId ||
          null;

        // Step 2: HR Manager
        step2ApproverId = hrManagerUserId || companyAdminUserId || null;
        break;
      }

      case UserRole.TEAM_LEAD: {
        // Step 1: Department Manager -> Reporting Manager -> Company Admin
        step1ApproverId =
          requester.deptManagerUserId ||
          requester.reportingManagerUserId ||
          companyAdminUserId ||
          null;

        // Step 2: HR Manager
        step2ApproverId = hrManagerUserId || companyAdminUserId || null;
        break;
      }

      case UserRole.DEPARTMENT_MANAGER:
      case UserRole.HR_MANAGER: {
        // Step 1: Company Admin (CEO)
        step1ApproverId = companyAdminUserId || null;
        // Step 2: Skipped (Dept Manager / HR only requires 1 executive step)
        step2ApproverId = null;
        step2Status = ApprovalStatus.SKIPPED;
        break;
      }

      case UserRole.COMPANY_ADMIN:
      case UserRole.SUPER_ADMIN:
      case UserRole.OPERATION_MANAGER: {
        // Top level admins auto-skip approval
        step1ApproverId = null;
        step1Status = ApprovalStatus.SKIPPED;
        step2ApproverId = null;
        step2Status = ApprovalStatus.SKIPPED;
        break;
      }

      default: {
        step1ApproverId = hrManagerUserId || companyAdminUserId || null;
        step2ApproverId = null;
        step2Status = ApprovalStatus.SKIPPED;
      }
    }

    // Auto-skip if requester is the assigned step 1 approver
    if (step1ApproverId && step1ApproverId === requester.userId) {
      step1Status = ApprovalStatus.SKIPPED;
    }

    // Auto-skip step 2 if identical to step 1
    if (
      step2ApproverId &&
      (step2ApproverId === requester.userId || step2ApproverId === step1ApproverId)
    ) {
      step2Status = ApprovalStatus.SKIPPED;
    }

    return {
      step1ApproverId,
      step1Status,
      step2ApproverId,
      step2Status,
    };
  }

  /**
   * Validates if the current user has permission to approve step 1 or step 2.
   */
  canApprove(
    step: 1 | 2,
    request: {
      step1ApproverId?: string | null;
      step2ApproverId?: string | null;
    },
    user: { id: string; role: UserRole },
  ): boolean {
    // Company Admin and Super Admin can always approve any step
    if (user.role === UserRole.COMPANY_ADMIN || user.role === UserRole.SUPER_ADMIN) {
      return true;
    }

    if (step === 1) {
      if (request.step1ApproverId && request.step1ApproverId === user.id) {
        return true;
      }
      // HR Managers can approve step 1 as a fallback
      if (user.role === UserRole.HR_MANAGER) {
        return true;
      }
    }

    if (step === 2) {
      if (request.step2ApproverId && request.step2ApproverId === user.id) {
        return true;
      }
      if (user.role === UserRole.HR_MANAGER) {
        return true;
      }
    }

    return false;
  }

  /**
   * Computes the total inclusive calendar days between two dates.
   */
  calculateTotalDays(startDate: string | Date, endDate: string | Date): number {
    const start = new Date(startDate);
    const end = new Date(endDate);

    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    const diff = end.getTime() - start.getTime();
    if (diff < 0) {
      throw new BadRequestException('End date cannot be earlier than start date.');
    }

    return Math.floor(diff / (1000 * 60 * 60 * 24)) + 1;
  }
}
