import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuditAction, EmployeeStatus, UserRole } from '@prisma/client';
import { EmployeesService } from './employees.service';

describe('HR-09 Administrative Employee Password Reset', () => {
  const companyId = 'comp-1';
  const ceoActor = { id: 'ceo-user', sub: 'ceo-user', email: 'ceo@acme.test', role: UserRole.COMPANY_ADMIN, companyId };
  const hrActor = { id: 'hr-user', sub: 'hr-user', email: 'hr@acme.test', role: UserRole.HR_MANAGER, companyId };

  function makeService(employeeRecord: any) {
    const auditCreate = jest.fn().mockResolvedValue({});
    const userUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma: any = {
      employee: { findFirst: jest.fn().mockResolvedValue(employeeRecord) },
      $transaction: jest.fn(async (cb: any) => cb({
        user: { updateMany: userUpdateMany },
        auditLog: { create: auditCreate },
      })),
    };
    const service = new EmployeesService(
      prisma,
      { resolveEmployeeScope: jest.fn() } as any,
      { sendMail: jest.fn() } as any,
      {} as any,
    );
    return { service, prisma, userUpdateMany, auditCreate };
  }

  it('allows COMPANY_ADMIN to reset subordinate password, invalidates sessions, requires password change, and logs audit without password', async () => {
    const { service, userUpdateMany, auditCreate } = makeService({
      id: 'emp-1',
      status: EmployeeStatus.ACTIVE,
      user: {
        id: 'u-emp-1',
        email: 'emp@acme.test',
        role: UserRole.HR_MANAGER,
        companyId,
        deletedAt: null,
        sessionVersion: 2,
        mustChangePassword: false,
      },
    });

    const result = await service.resetEmployeePassword('emp-1', { temporaryPassword: 'TempPass@2026' }, ceoActor, '127.0.0.1', 'Jest');
    expect(result.message).toMatch(/Temporary password set/i);
    expect(JSON.stringify(result)).not.toContain('TempPass@2026');

    expect(userUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        mustChangePassword: true,
        refreshTokenHash: null,
        sessionVersion: { increment: 1 },
        failedLoginAttempts: 0,
        lockedUntil: null,
      }),
    }));

    const auditArg = auditCreate.mock.calls[0][0].data;
    expect(auditArg.action).toBe(AuditAction.PASSWORD_RESET);
    expect(JSON.stringify(auditArg)).not.toContain('TempPass@2026');
  });

  it('preserves suspension lock when resetting a suspended employee password', async () => {
    const { service, userUpdateMany } = makeService({
      id: 'emp-susp',
      status: EmployeeStatus.SUSPENDED,
      user: {
        id: 'u-susp',
        email: 'susp@acme.test',
        role: UserRole.EMPLOYEE,
        companyId,
        deletedAt: null,
        sessionVersion: 0,
        mustChangePassword: false,
      },
    });

    await service.resetEmployeePassword('emp-susp', { temporaryPassword: 'TempPass@2026' }, ceoActor);
    const updateData = userUpdateMany.mock.calls[0][0].data;
    expect(updateData.lockedUntil).toBeUndefined();
    expect(updateData.mustChangePassword).toBe(true);
  });

  it('blocks HR_MANAGER from resetting CEO or another HR_MANAGER password', async () => {
    const ceoTarget = makeService({
      id: 'emp-ceo',
      status: EmployeeStatus.ACTIVE,
      user: { id: 'ceo-user', email: 'ceo@acme.test', role: UserRole.COMPANY_ADMIN, companyId, deletedAt: null, sessionVersion: 0, mustChangePassword: false },
    });
    await expect(ceoTarget.service.resetEmployeePassword('emp-ceo', { temporaryPassword: 'TempPass@2026' }, hrActor))
      .rejects.toThrow(ForbiddenException);

    const hrTarget = makeService({
      id: 'emp-hr2',
      status: EmployeeStatus.ACTIVE,
      user: { id: 'hr-user-2', email: 'hr2@acme.test', role: UserRole.HR_MANAGER, companyId, deletedAt: null, sessionVersion: 0, mustChangePassword: false },
    });
    await expect(hrTarget.service.resetEmployeePassword('emp-hr2', { temporaryPassword: 'TempPass@2026' }, hrActor))
      .rejects.toThrow(ForbiddenException);
  });

  it('blocks unauthorized roles, cross-tenant targets, and weak passwords', async () => {
    const empActor = { id: 'e1', sub: 'e1', email: 'e@acme.test', role: UserRole.EMPLOYEE, companyId };
    const { service } = makeService(null);

    await expect(service.resetEmployeePassword('emp-1', { temporaryPassword: 'TempPass@2026' }, empActor))
      .rejects.toThrow(ForbiddenException);
    await expect(service.resetEmployeePassword('emp-1', { temporaryPassword: 'weak' }, ceoActor))
      .rejects.toThrow(BadRequestException);
    await expect(service.resetEmployeePassword('other-tenant-emp', { temporaryPassword: 'TempPass@2026' }, ceoActor))
      .rejects.toThrow(NotFoundException);
  });
});
