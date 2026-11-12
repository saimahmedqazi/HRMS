import { ConfigService } from '@nestjs/config';
import { CompanyStatus, EmployeeStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { JwtPayload, JwtStrategy } from './jwt.strategy';

describe('access session validation', () => {
  const user = {
    id: 'user-1',
    email: 'fixture@example.test',
    companyId: 'tenant-1',
    role: UserRole.EMPLOYEE,
    deletedAt: null,
    sessionVersion: 0,
    company: { status: CompanyStatus.ACTIVE },
    employee: { status: EmployeeStatus.ACTIVE, deletedAt: null },
  };
  const payload: JwtPayload = {
    sub: user.id,
    email: user.email,
    companyId: user.companyId,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + 900,
  };
  const prisma = {
    user: { findUnique: jest.fn() },
    supportModeSession: { findFirst: jest.fn() },
  };
  const strategy = new JwtStrategy(
    new ConfigService({ app: { jwt: { accessSecret: 'fixture-signing-secret' } } }),
    prisma as unknown as PrismaService,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.user.findUnique.mockResolvedValue(user);
  });

  it('returns the live account identity for an authenticated tenant session', async () => {
    await expect(strategy.validate(payload)).resolves.toMatchObject({
      id: user.id,
      companyId: user.companyId,
      role: user.role,
    });
  });

  it('rejects incomplete authentication before loading account data', async () => {
    await expect(strategy.validate({ ...payload, is2faTemp: true })).rejects.toThrow('Invalid access session');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a session when its tenant becomes suspended', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...user,
      company: { status: CompanyStatus.SUSPENDED },
    });
    await expect(strategy.validate(payload)).rejects.toThrow('inactive or suspended');
  });

  it('rejects outdated role claims', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...user, role: UserRole.TEAM_LEAD });
    await expect(strategy.validate(payload)).rejects.toThrow('permissions have changed');
  });

  it('rejects previous access sessions and accepts the new version', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...user, sessionVersion: 1 });

    await expect(strategy.validate(payload)).rejects.toThrow('Session expired');
    await expect(strategy.validate({ ...payload, sessionVersion: 1 })).resolves.toMatchObject({ sessionVersion: 1 });
  });

  it('requires an active Support Mode record for the selected tenant', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...user, companyId: null, company: null, employee: null, role: UserRole.SUPER_ADMIN,
    });
    const support = {
      ...payload,
      role: UserRole.SUPER_ADMIN,
      companyId: null,
      supportModeCompanyId: user.companyId,
      sessionId: 'session-1',
    };
    prisma.supportModeSession.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'session-1' });
    await expect(strategy.validate(support)).rejects.toThrow('Support session has ended');
    await expect(strategy.validate(support)).resolves.toMatchObject({
      companyId: user.companyId,
      supportModeCompanyId: user.companyId,
      supportModeSessionId: 'session-1',
    });
    expect(prisma.supportModeSession.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: 'session-1',
        superAdminId: user.id,
        companyId: user.companyId,
        endedAt: null,
        expiresAt: { gt: expect.any(Date) },
      },
    }));
  });
});
