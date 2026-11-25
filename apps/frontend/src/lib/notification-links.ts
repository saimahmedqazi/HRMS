export interface NotificationNavItem {
  id: string;
  type: string;
  title?: string;
  body?: string;
  data?: Record<string, unknown> | null;
}

const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

function safeEntityId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return SAFE_ID_PATTERN.test(trimmed) ? trimmed : null;
}

const APPROVER_ROLES = new Set([
  'SUPER_ADMIN',
  'COMPANY_ADMIN',
  'HR_MANAGER',
  'DEPARTMENT_MANAGER',
  'TEAM_LEAD',
]);

/**
 * Resolves a safe, role-scoped internal destination route for a notification.
 * Never trusts arbitrary URLs from notification metadata.
 */
export function resolveNotificationHref(
  item: NotificationNavItem,
  userRole?: string,
): string {
  const data = item.data && typeof item.data === 'object' ? item.data : {};
  const titleLower = (item.title || '').toLowerCase();
  const bodyLower = (item.body || '').toLowerCase();

  if (item.type === 'LEAVE') {
    const leaveRequestId = safeEntityId(data.leaveRequestId);
    const isApprovalPrompt =
      titleLower.includes('awaiting approval') ||
      titleLower.includes('approval required') ||
      titleLower.includes('escalated');

    if (isApprovalPrompt && userRole && APPROVER_ROLES.has(userRole)) {
      return leaveRequestId
        ? `/dashboard/leave-approvals?requestId=${encodeURIComponent(leaveRequestId)}`
        : '/dashboard/leave-approvals';
    }

    const employeeLeaveBase =
      userRole === 'EMPLOYEE' ? '/dashboard/my-leave' : '/dashboard/leave';
    return leaveRequestId
      ? `${employeeLeaveBase}?requestId=${encodeURIComponent(leaveRequestId)}`
      : employeeLeaveBase;
  }

  if (item.type === 'ATTENDANCE_EXCEPTION') {
    const attendanceId = safeEntityId(data.attendanceId);
    if (
      userRole === 'SUPER_ADMIN' ||
      userRole === 'COMPANY_ADMIN' ||
      userRole === 'HR_MANAGER'
    ) {
      return attendanceId
        ? `/dashboard/attendance/exceptions?recordId=${encodeURIComponent(attendanceId)}`
        : '/dashboard/attendance/exceptions';
    }
    return userRole === 'EMPLOYEE'
      ? '/dashboard/my-attendance'
      : '/dashboard/attendance';
  }

  if (item.type === 'RESOURCE') {
    const requestId = safeEntityId(data.requestId ?? data.resourceRequestId);
    return requestId
      ? `/dashboard/resources?requestId=${encodeURIComponent(requestId)}`
      : '/dashboard/resources';
  }

  if (item.type === 'PAYROLL') {
    if (userRole === 'EMPLOYEE') return '/dashboard/my-payslips';
    if (userRole === 'DEPARTMENT_MANAGER') return '/dashboard/payroll-view';
    if (userRole === 'COMPANY_ADMIN' || userRole === 'HR_MANAGER') {
      return '/dashboard/payroll';
    }
    return '/dashboard/my-payslips';
  }

  if (item.type === 'IMPORT') {
    return '/dashboard/bulk-import';
  }

  if (data.kind === 'SHIFT_ASSIGNMENT') {
    const employeeId = safeEntityId(data.employeeId);
    if (
      employeeId &&
      (userRole === 'SUPER_ADMIN' || userRole === 'COMPANY_ADMIN' || userRole === 'HR_MANAGER')
    ) {
      return `/dashboard/employees/${encodeURIComponent(employeeId)}`;
    }
    return userRole === 'EMPLOYEE' ? '/dashboard/my-attendance' : '/dashboard/attendance';
  }

  if (
    titleLower.includes('break') ||
    bodyLower.includes('break') ||
    titleLower.includes('attendance')
  ) {
    return userRole === 'EMPLOYEE'
      ? '/dashboard/my-attendance'
      : '/dashboard/attendance';
  }

  return '/dashboard';
}
