import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../../common/mail/mail.service';
import { DataScopeService } from '../../common/services/data-scope.service';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UserRole } from '@prisma/client';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;
  let jwtService: JwtService;

  const mockPrisma: any = {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    company: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    shift: {
      create: jest.fn(),
    },
    leaveTypeSetting: {
      createMany: jest.fn(),
    },
    employee: {
      create: jest.fn(),
    },
    $transaction: jest.fn((callback: any): any => callback(mockPrisma)),
  };

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mock-jwt-token'),
    signAsync: jest.fn().mockResolvedValue('mock-jwt-token'),
    verify: jest.fn(),
    verifyAsync: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: unknown) => {
      if (key === 'app.security.bcryptRounds') return 10;
      if (key === 'app.security.maxLoginAttempts') return 5;
      if (key === 'app.security.lockoutDurationMinutes') return 15;
      if (key === 'app.jwt.accessSecret') return 'test-access-secret';
      if (key === 'app.jwt.refreshSecret') return 'test-refresh-secret';
      return defaultValue;
    }),
  };

  const mockMailService = {
    sendVerificationEmail: jest.fn().mockResolvedValue(true),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
  };

  const mockDataScopeService = {
    getAllowedModules: jest.fn().mockReturnValue(['dashboard']),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: MailService, useValue: mockMailService },
        { provide: DataScopeService, useValue: mockDataScopeService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
    jwtService = module.get<JwtService>(JwtService);
    jest.clearAllMocks();
  });

  describe('registerCompany', () => {
    it('should throw ConflictException if email is already taken', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'existing-id' });

      await expect(
        service.registerCompany({
          companyName: 'Acme Corp',
          adminEmail: 'existing@acme.com',
          adminPassword: 'Password123',
          adminFirstName: 'John',
          adminLastName: 'Doe',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should register company and admin user when email is available', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);
      mockPrisma.company.create.mockResolvedValueOnce({ id: 'comp-1', name: 'Acme Corp' });
      mockPrisma.shift.create.mockResolvedValueOnce({ id: 'shift-1' });
      mockPrisma.leaveTypeSetting.createMany.mockResolvedValueOnce({ count: 3 });
      mockPrisma.user.create.mockResolvedValueOnce({
        id: 'user-1',
        email: 'admin@acme.com',
        role: UserRole.COMPANY_ADMIN,
        firstName: 'John',
        lastName: 'Doe',
      });
      mockPrisma.employee.create.mockResolvedValueOnce({ id: 'emp-1' });
      mockPrisma.user.update.mockResolvedValueOnce({});

      const result = await service.registerCompany({
        companyName: 'Acme Corp',
        adminEmail: 'admin@acme.com',
        adminPassword: 'Password123',
        adminFirstName: 'John',
        adminLastName: 'Doe',
      });

      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.user.email).toBe('admin@acme.com');
      expect(result.user.role).toBe(UserRole.COMPANY_ADMIN);
      expect(mockPrisma.company.create).toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('should throw UnauthorizedException for unknown email', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.login({ email: 'unknown@test.com', password: 'pass' }, '127.0.0.1', 'agent'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if account is locked', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'user-locked',
        email: 'locked@test.com',
        lockedUntil: new Date(Date.now() + 10 * 60000), // locked for 10 more minutes
      });

      await expect(
        service.login({ email: 'locked@test.com', password: 'pass' }, '127.0.0.1', 'agent'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should increment failed attempts and lock account after 5 failed attempts', async () => {
      const passwordHash = await bcrypt.hash('CorrectPassword123', 10);
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'user-1',
        email: 'user@test.com',
        passwordHash,
        failedLoginAttempts: 4, // 5th attempt will lock
        lockedUntil: null,
      });

      await expect(
        service.login({ email: 'user@test.com', password: 'WrongPassword' }, '127.0.0.1', 'agent'),
      ).rejects.toThrow(/Account locked for 15 minutes/);

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            failedLoginAttempts: 0,
            lockedUntil: expect.any(Date),
          }),
        }),
      );
    });

    it('should return 2FA challenge if user has 2FA enabled and code is not supplied', async () => {
      const passwordHash = await bcrypt.hash('CorrectPassword123', 10);
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'user-2fa',
        email: 'user2fa@test.com',
        passwordHash,
        failedLoginAttempts: 0,
        lockedUntil: null,
        twoFaEnabled: true,
        twoFaSecret: 'JBSWY3DPEHPK3PXP',
      });

      const result = await service.login(
        { email: 'user2fa@test.com', password: 'CorrectPassword123' },
        '127.0.0.1',
        'agent',
      );

      expect(result).toHaveProperty('requires2fa', true);
      expect(result).toHaveProperty('tempToken');
    });

    it('should login successfully with correct credentials', async () => {
      const passwordHash = await bcrypt.hash('CorrectPassword123', 10);
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'user-ok',
        email: 'ok@test.com',
        passwordHash,
        failedLoginAttempts: 0,
        lockedUntil: null,
        twoFaEnabled: false,
        role: UserRole.EMPLOYEE,
        companyId: 'comp-1',
        company: { name: 'Acme Corp' },
        employee: { firstName: 'Alice', lastName: 'Smith' },
      });
      mockPrisma.user.update.mockResolvedValueOnce({});

      const result = await service.login(
        { email: 'ok@test.com', password: 'CorrectPassword123' },
        '127.0.0.1',
        'agent',
      );

      expect(result).toHaveProperty('accessToken');
      expect((result as any).user.email).toBe('ok@test.com');
    });
  });

  describe('logout', () => {
    it('should clear refresh token hash from user record', async () => {
      mockPrisma.user.update.mockResolvedValueOnce({});

      await service.logout('user-1');
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { refreshTokenHash: null },
      });
    });
  });
});
