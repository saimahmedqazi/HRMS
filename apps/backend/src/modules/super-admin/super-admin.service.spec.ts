import { Test, TestingModule } from '@nestjs/testing';
import { SuperAdminService } from './super-admin.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { CompanyStatus, UserRole, AuditAction } from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

describe('SuperAdminService', () => {
  let service: SuperAdminService;
  let prisma: PrismaService;

  const mockPrisma = {
    company: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    user: {
      count: jest.fn(),
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
      if (key === 'app.jwt.accessSecret') return 'test-access-secret';
      return defaultValue;
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
