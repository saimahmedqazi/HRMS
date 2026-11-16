import { Test, TestingModule } from '@nestjs/testing';
import { SuperAdminService } from './super-admin.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { CompanyStatus, CompanySuspensionReason, UserRole, AuditAction } from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import * as bcrypt from 'bcrypt';

describe('SuperAdminService', () => {
  let service: SuperAdminService;
  let prisma: PrismaService;

  const mockPrisma = {
    $transaction: jest.fn(),
    company: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    user: {
      count: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    supportModeSession: {
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  };

  const mockJwtService = {
    signAsync: jest.fn().mockResolvedValue('support-mode-jwt'),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: unknown) => {
      if (key === 'app.security.supportModeDurationHours') return 1;
      return defaultValue;
    }),
    getOrThrow: jest.fn((key: string) => {
      if (key === 'app.jwt.accessSecret') return 'test-access-secret';
      throw new Error(`Missing test configuration: ${key}`);
    }),
  };

  const mockSuperAdmin: AuthenticatedUser = {
    id: 'super-admin-1',
    email: 'superadmin@zenhr.com',
    role: UserRole.SUPER_ADMIN,
    companyId: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuperAdminService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<SuperAdminService>(SuperAdminService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation((callback) => callback(mockPrisma));
  });

  describe('updateCompanyStatus', () => {
    it('should update company status and record audit log', async () => {
      mockPrisma.company.findUnique.mockResolvedValueOnce({
        id: 'comp-1',
        status: CompanyStatus.ACTIVE,
      });
      mockPrisma.company.update.mockResolvedValueOnce({
        id: 'comp-1',
        status: CompanyStatus.SUSPENDED,
      });
      mockPrisma.auditLog.create.mockResolvedValueOnce({});

      const result = await service.updateCompanyStatus(
        'comp-1',
        CompanyStatus.SUSPENDED,
        mockSuperAdmin,
      );

      expect(result.status).toBe(CompanyStatus.SUSPENDED);
      expect(mockPrisma.company.update).toHaveBeenCalledWith({
        where: { id: 'comp-1' },
        data: { status: CompanyStatus.SUSPENDED, suspensionReason: CompanySuspensionReason.MANUAL },
      });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'super-admin-1',
          action: AuditAction.STATUS_CHANGE,
          entity: 'Company',
          entityId: 'comp-1',
        }),
      });
    });
  });

  describe('resetOperationManagerPassword', () => {
    const operationManager = {
      id: 'ops-1',
      email: 'ops@zenhr.com',
      role: UserRole.OPERATION_MANAGER,
      companyId: null,
      deletedAt: null,
      sessionVersion: 4,
      failedLoginAttempts: 5,
      lockedUntil: new Date(Date.now() + 60_000),
      twoFaEnabled: true,
    };

    it('resets only the platform operation manager, revokes sessions, and audits without the password', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(operationManager);
      mockPrisma.user.updateMany.mockResolvedValueOnce({ count: 1 });
      mockPrisma.auditLog.create.mockResolvedValueOnce({});

      const result = await service.resetOperationManagerPassword(mockSuperAdmin, '203.0.113.7', 'QA browser');

      expect(result.email).toBe('ops@zenhr.com');
      expect(result.temporaryPassword).toMatch(/^[A-Za-z0-9_-]{32}$/);
      expect(result.twoFactorEnabled).toBe(true);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'ops@zenhr.com' } });
      expect(mockPrisma.user.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'ops-1',
          role: UserRole.OPERATION_MANAGER,
          companyId: null,
          deletedAt: null,
          sessionVersion: 4,
        },
        data: expect.objectContaining({
          refreshTokenHash: null,
          sessionVersion: { increment: 1 },
          passwordResetToken: null,
          passwordResetExpiry: null,
          failedLoginAttempts: 0,
          lockedUntil: null,
        }),
      });
      const passwordHash = mockPrisma.user.updateMany.mock.calls[0][0].data.passwordHash;
      await expect(bcrypt.compare(result.temporaryPassword, passwordHash)).resolves.toBe(true);

      const auditData = mockPrisma.auditLog.create.mock.calls[0][0].data;
      expect(auditData).toMatchObject({
        userId: 'super-admin-1',
        action: AuditAction.PASSWORD_RESET,
        entity: 'User',
        entityId: 'ops-1',
        ipAddress: '203.0.113.7',
        userAgent: 'QA browser',
        newValues: {
          email: 'ops@zenhr.com',
          role: UserRole.OPERATION_MANAGER,
          method: 'SUPER_ADMIN_RECOVERY',
          resetBy: 'superadmin@zenhr.com',
          sessionVersion: 5,
        },
      });
      expect(JSON.stringify(auditData)).not.toContain(result.temporaryPassword);
      expect(JSON.stringify(mockPrisma.user.updateMany.mock.calls[0][0])).not.toContain(result.temporaryPassword);
    });

    it('does not reset an account while the super admin is in support mode', async () => {
      await expect(service.resetOperationManagerPassword({
        ...mockSuperAdmin,
        supportModeCompanyId: 'tenant-1',
      })).rejects.toThrow('Exit Support Mode');
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('refuses to reset a missing or non-platform account', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);
      await expect(service.resetOperationManagerPassword(mockSuperAdmin)).rejects.toThrow('account was not found');

      mockPrisma.user.findUnique.mockResolvedValueOnce({
        ...operationManager,
        role: UserRole.COMPANY_ADMIN,
      });
      await expect(service.resetOperationManagerPassword(mockSuperAdmin)).rejects.toThrow('not a platform account');
      expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('does not issue a password if the target changed concurrently', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(operationManager);
      mockPrisma.user.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.resetOperationManagerPassword(mockSuperAdmin)).rejects.toThrow('changed during reset');
      expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    });
  });

  describe('enterSupportMode', () => {
    it('should create support session, write audit log, and return support token', async () => {
      mockPrisma.company.findUnique.mockResolvedValueOnce({
        id: 'comp-target',
        name: 'Target Company',
      });
      mockPrisma.supportModeSession.create.mockResolvedValueOnce({
        id: 'session-123',
        companyId: 'comp-target',
      });
      mockPrisma.auditLog.create.mockResolvedValueOnce({});

      const result = await service.enterSupportMode(
        'comp-target',
        'Investigating ticket #4321',
        mockSuperAdmin,
      );

      expect(result.accessToken).toBe('support-mode-jwt');
      expect(result.session.id).toBe('session-123');
      expect(mockPrisma.supportModeSession.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          superAdminId: 'super-admin-1',
          companyId: 'comp-target',
          reason: 'Investigating ticket #4321',
        }),
      });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: AuditAction.SUPPORT_MODE_ENTER,
          entityId: 'comp-target',
        }),
      });
    });
  });

  describe('exitSupportMode', () => {
    it('should close active session, record audit log, and issue standard token', async () => {
      mockPrisma.supportModeSession.updateMany.mockResolvedValueOnce({ count: 1 });
      mockPrisma.auditLog.create.mockResolvedValueOnce({});

      const result = await service.exitSupportMode('comp-target', mockSuperAdmin);

      expect(result.accessToken).toBe('support-mode-jwt');
      expect(mockPrisma.supportModeSession.updateMany).toHaveBeenCalledWith({
        where: {
          superAdminId: 'super-admin-1',
          companyId: 'comp-target',
          endedAt: null,
        },
        data: { endedAt: expect.any(Date) },
      });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: AuditAction.SUPPORT_MODE_EXIT,
        }),
      });
    });
  });
});
