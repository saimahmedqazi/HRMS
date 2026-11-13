import {
  Injectable,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { authenticator } from 'otplib';
import * as qrcode from 'qrcode';
import * as crypto from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MailService } from '../../common/mail/mail.service';
import { DataScopeService } from '../../common/services/data-scope.service';
import { getLoginNetworkLocation } from '../../common/utils/login-network-location';
import { isRevokedImportPassword, PASSWORD_SETUP_REQUIRED } from '../../common/utils/password-policy';
import { RegisterCompanyDto } from './dto/register-company.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { isInactiveAccount } from './account-state';
import { decryptTotpSecret, encryptTotpSecret, isLegacyTotpSecret, parseTotpEncryptionKey } from './totp-secret';
import { CompanyStatus, UserRole, DataScope, LeaveType, EmployeeStatus, Prisma } from '@prisma/client';

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    role: UserRole;
    firstName?: string;
    lastName?: string;
    companyId: string | null;
    companyName?: string;
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly totpEncryptionKey: Buffer | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
    private readonly dataScopeService: DataScopeService,
  ) {
    const key = configService.get<string>('app.security.totpEncryptionKey');
    this.totpEncryptionKey = key || configService.get<string>('app.nodeEnv') === 'production'
      ? parseTotpEncryptionKey(key)
      : null;
  }

  private validateNewPassword(password: string): void {
    if (Buffer.byteLength(password, 'utf8') > 72) {
      throw new BadRequestException('Password must be at most 72 bytes in UTF-8.');
    }
    if (isRevokedImportPassword(password)) throw new BadRequestException('Choose a different password.');
  }

  async registerCompany(dto: RegisterCompanyDto): Promise<TokenResponse> {
    this.validateNewPassword(dto.adminPassword);
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.adminEmail.toLowerCase() },
    });

    if (existing) {
      throw new ConflictException('An account with this email address already exists');
    }

    const saltRounds = this.configService.get<number>('app.security.bcryptRounds', 12);
    const passwordHash = await bcrypt.hash(dto.adminPassword, saltRounds);
    const slug = dto.companyName.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now();

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Create company
      const company = await tx.company.create({
        data: {
          name: dto.companyName,
          slug,
          email: dto.companyEmail?.toLowerCase() || dto.adminEmail.toLowerCase(),
          status: CompanyStatus.ACTIVE,
        },
      });

      // 2. Create default shift for company (9:00 - 17:00, 60m break)
      await tx.shift.create({
        data: {
          companyId: company.id,
          name: 'General Shift',
          startTime: '09:00',
          endTime: '17:00',
          breakDuration: 60,
          workDays: [1, 2, 3, 4, 5],
          isDefault: true,
        },
      });

      // 3. Create default leave types
      await tx.leaveTypeSetting.createMany({
        data: [
          { companyId: company.id, leaveType: LeaveType.CASUAL, annualAllocation: 10, requiresReason: true, requiresMedicalCert: false },
          { companyId: company.id, leaveType: LeaveType.SICK, annualAllocation: 12, requiresReason: false, requiresMedicalCert: true },
          { companyId: company.id, leaveType: LeaveType.ANNUAL, annualAllocation: 14, requiresReason: true, requiresMedicalCert: false },
        ],
      });

      // 4. Create admin user
      const user = await tx.user.create({
        data: {
          companyId: company.id,
          email: dto.adminEmail.toLowerCase(),
          passwordHash,
          role: UserRole.COMPANY_ADMIN,
          dataScope: DataScope.COMPANY,
          isEmailVerified: true,
        },
      });

      // 5. Create employee profile for admin
      await tx.employee.create({
        data: {
          companyId: company.id,
          userId: user.id,
          employeeCode: 'EMP-001',
          firstName: dto.adminFirstName,
          lastName: dto.adminLastName,
          hireDate: new Date(),
          status: EmployeeStatus.ACTIVE,
        },
      });

      return { company, user };
    });

    const tokens = await this.generateTokens(result.user);
    await this.storeRefreshTokenHash(result.user, tokens.refreshToken);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: result.user.id,
        email: result.user.email,
        role: result.user.role,
        firstName: dto.adminFirstName,
        lastName: dto.adminLastName,
        companyId: result.company.id,
        companyName: result.company.name,
      },
    };
  }

  async login(
    dto: LoginDto,
    ip: string | null,
    userAgent: string,
  ): Promise<
    | TokenResponse
    | { requires2fa: true; tempToken: string }
  > {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: { company: true, employee: true },
    });

    if (!user || user.deletedAt) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.company && user.company.status === CompanyStatus.SUSPENDED) {
      throw new UnauthorizedException('Your organization account is currently suspended.');
    }
    if (isInactiveAccount(user)) {
      throw new UnauthorizedException('User account is inactive.');
    }

    // Check account lockout
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesRemaining = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      throw new UnauthorizedException(
        `Account is temporarily locked due to multiple failed login attempts. Try again in ${minutesRemaining} minutes.`,
      );
    }

    // Verify password
    const isPasswordValid = user.passwordHash !== PASSWORD_SETUP_REQUIRED &&
      !isRevokedImportPassword(dto.password) && await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      return this.recordFailedAuthentication(user.id, 'Invalid credentials');
    }

    // Check 2FA
    if (user.twoFaEnabled) {
      if (!user.twoFaSecret) {
        throw new UnauthorizedException('Two-factor authentication is unavailable for this account.');
      }
      if (!dto.twoFactorCode) {
        // Issue short-lived temp token (5 min) for 2FA verification step
        const tempToken = this.jwtService.sign(
          { sub: user.id, is2faTemp: true, sessionVersion: user.sessionVersion },
          {
            secret: this.configService.getOrThrow<string>('app.jwt.accessSecret'),
            expiresIn: '5m',
          },
        );
        return { requires2fa: true, tempToken };
      }

      const isTotpValid = authenticator.verify({
        token: dto.twoFactorCode,
        secret: this.readTotpSecret(user.id, user.twoFaSecret),
      });

      if (!isTotpValid) {
        // Check backup codes
        const backupValid = await this.verifyBackupCode(user.id, dto.twoFactorCode, user.twoFaBackupCodes);
        if (!backupValid) {
          return this.recordFailedAuthentication(user.id, 'Invalid two-factor code');
        }
      }
    }

    const { lastLoginIp, lastLoginCity, lastLoginCountry } = getLoginNetworkLocation(ip);

    const authenticated = await this.prisma.user.updateMany({
      where: { id: user.id, sessionVersion: user.sessionVersion, deletedAt: null, OR: [{ lockedUntil: null }, { lockedUntil: { lte: new Date() } }] },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        lastLoginIp,
        lastLoginUserAgent: userAgent.slice(0, 255),
        lastLoginCity,
        lastLoginCountry,
      },
    });
    if (authenticated.count === 0) {
      throw new UnauthorizedException('Account is temporarily unavailable for sign-in.');
    }

    const tokens = await this.generateTokens(user);
    await this.storeRefreshTokenHash(user, tokens.refreshToken);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.employee?.firstName,
        lastName: user.employee?.lastName,
        companyId: user.companyId,
        companyName: user.company?.name,
      },
    };
  }

  async verify2faLogin(
    tempToken: string,
    code: string,
    ip: string | null = null,
    userAgent = 'Unknown',
  ): Promise<TokenResponse> {
    let payload: { sub: string; is2faTemp?: boolean; sessionVersion?: number };
    try {
      payload = this.jwtService.verify(tempToken, {
        secret: this.configService.getOrThrow<string>('app.jwt.accessSecret'),
      });
    } catch {
      throw new UnauthorizedException('Expired or invalid two-factor verification session');
    }

    if (!payload.is2faTemp) {
      throw new UnauthorizedException('Invalid token type');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { company: true, employee: true },
    });

    if (!user || isInactiveAccount(user) || user.passwordHash === PASSWORD_SETUP_REQUIRED ||
        (payload.sessionVersion ?? 0) !== user.sessionVersion || !user.twoFaEnabled || !user.twoFaSecret ||
        (user.lockedUntil && user.lockedUntil > new Date())) {
      throw new UnauthorizedException('User not found or 2FA not enabled');
    }

    const isTotpValid = authenticator.verify({
      token: code,
      secret: this.readTotpSecret(user.id, user.twoFaSecret),
    });

    if (!isTotpValid) {
      const backupValid = await this.verifyBackupCode(user.id, code, user.twoFaBackupCodes);
      if (!backupValid) {
        return this.recordFailedAuthentication(user.id, 'Invalid two-factor code');
      }
    }

    const { lastLoginIp, lastLoginCity, lastLoginCountry } = getLoginNetworkLocation(ip);

    const authenticated = await this.prisma.user.updateMany({
      where: { id: user.id, sessionVersion: user.sessionVersion, deletedAt: null, OR: [{ lockedUntil: null }, { lockedUntil: { lte: new Date() } }] },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        lastLoginIp,
        lastLoginUserAgent: userAgent.slice(0, 255),
        lastLoginCity,
        lastLoginCountry,
      },
    });
    if (authenticated.count === 0) {
      throw new UnauthorizedException('Account is temporarily unavailable for sign-in.');
    }

    const tokens = await this.generateTokens(user);
    await this.storeRefreshTokenHash(user, tokens.refreshToken);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.employee?.firstName,
        lastName: user.employee?.lastName,
        companyId: user.companyId,
        companyName: user.company?.name,
      },
    };
  }

  async refreshToken(oldRefreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    let payload: { sub: string; sessionVersion?: number };
    try {
      payload = this.jwtService.verify(oldRefreshToken, {
        secret: this.configService.getOrThrow<string>('app.jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { company: { select: { status: true } }, employee: { select: { status: true, deletedAt: true } } },
    });

    if (!user || isInactiveAccount(user) || user.passwordHash === PASSWORD_SETUP_REQUIRED ||
        (payload.sessionVersion ?? 0) !== user.sessionVersion || user.refreshTokenHash !== this.hashRefreshToken(oldRefreshToken) ||
        (user.lockedUntil && user.lockedUntil > new Date())) {
      throw new UnauthorizedException('Session expired');
    }

    const tokens = await this.generateTokens(user);
    const rotated = await this.prisma.user.updateMany({
      where: { id: user.id, sessionVersion: user.sessionVersion, refreshTokenHash: user.refreshTokenHash, deletedAt: null },
      data: { refreshTokenHash: this.hashRefreshToken(tokens.refreshToken) },
    });
    if (rotated.count !== 1) {
      throw new UnauthorizedException('Session expired');
    }

    return tokens;
  }

  async logout(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user || user.deletedAt) {
      // Prevent email enumeration
      return;
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 3600000); // 1 hour

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: token,
        passwordResetExpiry: expiry,
      },
    });

    await this.mailService.sendPasswordResetEmail(user.email, token);
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    this.validateNewPassword(dto.newPassword);
    const user = await this.prisma.user.findFirst({
      where: {
        passwordResetToken: dto.token,
        passwordResetExpiry: { gt: new Date() },
        deletedAt: null,
      },
    });

    if (!user) {
      throw new BadRequestException('Password reset token is invalid or has expired');
    }

    const saltRounds = this.configService.get<number>('app.security.bcryptRounds', 12);
    const passwordHash = await bcrypt.hash(dto.newPassword, saltRounds);

    const reset = await this.prisma.user.updateMany({
      where: {
        id: user.id,
        passwordResetToken: dto.token,
        passwordResetExpiry: { gt: new Date() },
        deletedAt: null,
      },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpiry: null,
        refreshTokenHash: null,
        sessionVersion: { increment: 1 },
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
    if (reset.count !== 1) {
      throw new BadRequestException('Password reset token is invalid or has expired');
    }
  }

  async verifyEmail(token: string): Promise<void> {
    if (typeof token !== 'string' || !token) {
      throw new BadRequestException('Invalid verification token');
    }
    const user = await this.prisma.user.findFirst({
      where: {
        emailVerifyToken: token,
        OR: [{ emailVerifyExpiry: null }, { emailVerifyExpiry: { gt: new Date() } }],
      },
    });

    if (!user) {
      throw new BadRequestException('Invalid verification token');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isEmailVerified: true,
        emailVerifyToken: null,
        emailVerifyExpiry: null,
      },
    });
  }

  async generateTotp(userId: string): Promise<{ secret: string; qrCodeDataUrl: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId }, select: { email: true, twoFaEnabled: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.twoFaEnabled) {
      throw new ConflictException('Two-factor authentication is already enabled.');
    }

    const secret = authenticator.generateSecret();
    const encryptedSecret = encryptTotpSecret(secret, userId, this.getTotpEncryptionKey());
    const appName = 'ZenHR';
    const otpAuthUrl = authenticator.keyuri(user.email, appName, secret);
    const qrCodeDataUrl = await qrcode.toDataURL(otpAuthUrl);

    const pending = await this.prisma.user.updateMany({
      where: { id: userId, twoFaEnabled: false, deletedAt: null },
      data: { twoFaSecret: encryptedSecret },
    });
    if (pending.count === 0) {
      throw new ConflictException('Two-factor authentication setup changed. Refresh Settings and try again.');
    }

    return { secret, qrCodeDataUrl };
  }

  async enableTotp(userId: string, code: string): Promise<{ backupCodes: string[] }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId }, select: { twoFaEnabled: true, twoFaSecret: true },
    });
    if (user?.twoFaEnabled) {
      throw new ConflictException('Two-factor authentication is already enabled.');
    }
    if (!user || !user.twoFaSecret) {
      throw new BadRequestException('Please generate 2FA secret first');
    }

    const key = this.getTotpEncryptionKey();
    const secret = this.readTotpSecret(userId, user.twoFaSecret);
    const isValid = authenticator.verify({ token: code, secret });

    if (!isValid) {
      throw new BadRequestException('Invalid verification code');
    }

    // Generate 8 backup codes
    const plainCodes: string[] = [];
    const hashedCodes: string[] = [];
    for (let i = 0; i < 8; i++) {
      const plainCode = crypto.randomBytes(4).toString('hex');
      plainCodes.push(plainCode);
      hashedCodes.push(await bcrypt.hash(plainCode, 10));
    }

    const enabled = await this.prisma.user.updateMany({
      where: { id: userId, twoFaEnabled: false, twoFaSecret: user.twoFaSecret, deletedAt: null },
      data: {
        twoFaEnabled: true,
        twoFaSecret: isLegacyTotpSecret(user.twoFaSecret) ? encryptTotpSecret(secret, userId, key) : user.twoFaSecret,
        twoFaBackupCodes: hashedCodes,
      },
    });
    if (enabled.count === 0) {
      throw new ConflictException('Two-factor authentication setup changed. Refresh Settings and try again.');
    }

    return { backupCodes: plainCodes };
  }

  async disableTotp(userId: string, passwordConfirm: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId }, select: { passwordHash: true, twoFaEnabled: true, twoFaSecret: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (!user.twoFaEnabled) throw new ConflictException('Two-factor authentication is already disabled.');

    const isMatch = user.passwordHash !== PASSWORD_SETUP_REQUIRED &&
      !isRevokedImportPassword(passwordConfirm) && await bcrypt.compare(passwordConfirm, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Incorrect password');
    }

    const disabled = await this.prisma.user.updateMany({
      where: { id: userId, twoFaEnabled: true, twoFaSecret: user.twoFaSecret, passwordHash: user.passwordHash, deletedAt: null },
      data: {
        twoFaEnabled: false,
        twoFaSecret: null,
        twoFaBackupCodes: [],
      },
    });
    if (disabled.count === 0) {
      throw new ConflictException('Two-factor authentication setup changed. Refresh Settings and try again.');
    }
  }

  async updateLocationConsent(userId: string, companyId: string | null | undefined, locationConsent: boolean) {
    if (!companyId) throw new ForbiddenException('Attendance preferences require an employee account');

    const result = await this.prisma.employee.updateMany({
      where: { userId, companyId, deletedAt: null },
      data: { locationConsent },
    });
    if (result.count === 0) throw new NotFoundException('Employee profile not found');
    return { locationConsent };
  }

  async getMe(userId: string, supportModeCompanyId?: string | null) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        twoFaEnabled: true,
        isEmailVerified: true,
        lastLoginAt: true,
        lastLoginIp: true,
        lastLoginUserAgent: true,
        companyId: true,
        company: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
            subscriptionTier: true,
            status: true,
          },
        },
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            profilePictureUrl: true,
            hireDate: true,
            status: true,
            locationConsent: true,
            department: { select: { id: true, name: true } },
            designation: { select: { id: true, name: true } },
            team: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!user) throw new NotFoundException('User not found');

    let supportModeCompany = null;
    if (supportModeCompanyId) {
      supportModeCompany = await this.prisma.company.findUnique({
        where: { id: supportModeCompanyId },
        select: {
          id: true,
          name: true,
          logoUrl: true,
          subscriptionTier: true,
          status: true,
        },
      });
    }

    const firstName =
      user.employee?.firstName ||
      (user.role === UserRole.SUPER_ADMIN
        ? 'Super'
        : user.role === UserRole.OPERATION_MANAGER
        ? 'Operations'
        : '');
    const lastName =
      user.employee?.lastName ||
      (user.role === UserRole.SUPER_ADMIN
        ? 'Admin'
        : user.role === UserRole.OPERATION_MANAGER
        ? 'Manager'
        : '');
    return {
      ...user,
      firstName,
      lastName,
      avatarUrl: user.employee?.profilePictureUrl || null,
      ...getLoginNetworkLocation(user.lastLoginIp),
      employee: user.employee
        ? {
            ...user.employee,
            employeeNumber: user.employee.employeeCode,
            designation: user.employee.designation
              ? {
                  ...user.employee.designation,
                  title: user.employee.designation.name,
                }
              : null,
          }
        : null,
      company: supportModeCompany || user.company,
      supportModeCompanyId: supportModeCompanyId || null,
      supportModeCompany,
    };
  }

  getAllowedModules(role: UserRole): string[] {
    return this.dataScopeService.getAllowedModules(role);
  }

  private async generateTokens(
    user: { id: string; email: string; role: UserRole; companyId: string | null; sessionVersion: number },
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessSecret = this.configService.getOrThrow<string>('app.jwt.accessSecret');
    const refreshSecret = this.configService.getOrThrow<string>('app.jwt.refreshSecret');
    const accessExpiresIn = this.configService.get<string>('app.jwt.accessExpiresIn', '15m');
    const refreshExpiresIn = this.configService.get<string>('app.jwt.refreshExpiresIn', '7d');

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
      sessionVersion: user.sessionVersion,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: accessSecret,
        expiresIn: accessExpiresIn,
      }),
      this.jwtService.signAsync(
        { sub: user.id, sessionVersion: user.sessionVersion, jti: crypto.randomUUID() },
        {
          secret: refreshSecret,
          expiresIn: refreshExpiresIn,
        },
      ),
    ]);

    return { accessToken, refreshToken };
  }

  private async storeRefreshTokenHash(user: { id: string; sessionVersion: number }, refreshToken: string): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { id: user.id, sessionVersion: user.sessionVersion, deletedAt: null },
        data: { refreshTokenHash: this.hashRefreshToken(refreshToken) },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new UnauthorizedException('Session expired');
      }
      throw error;
    }
  }

  private hashRefreshToken(token: string): string {
    return `sha256:${crypto.createHash('sha256').update(token).digest('hex')}`;
  }

  private getTotpEncryptionKey(): Buffer {
    if (!this.totpEncryptionKey) {
      throw new ServiceUnavailableException('Two-factor authentication storage is not configured.');
    }
    return this.totpEncryptionKey;
  }

  private readTotpSecret(userId: string, stored: string): string {
    if (isLegacyTotpSecret(stored)) return stored;
    const key = this.getTotpEncryptionKey();
    try {
      return decryptTotpSecret(stored, userId, key);
    } catch {
      this.logger.error('A stored two-factor secret could not be decrypted.');
      throw new ServiceUnavailableException('Two-factor authentication is temporarily unavailable.');
    }
  }

  private async recordFailedAuthentication(userId: string, message: string): Promise<never> {
    const maxAttempts = this.configService.get<number>('app.security.maxLoginAttempts', 5);
    const lockoutMinutes = this.configService.get<number>('app.security.lockoutDurationMinutes', 15);
    const now = new Date();
    const outcome = await this.prisma.$transaction(async (tx) => {
      const incremented = await tx.user.updateMany({
        where: { id: userId, deletedAt: null, OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }] },
        data: { failedLoginAttempts: { increment: 1 } },
      });
      if (incremented.count === 0) return 'unavailable';

      const locked = await tx.user.updateMany({
        where: { id: userId, failedLoginAttempts: { gte: maxAttempts } },
        data: { failedLoginAttempts: 0, lockedUntil: new Date(now.getTime() + lockoutMinutes * 60000) },
      });
      return locked.count > 0 ? 'locked' : 'failed';
    });

    if (outcome === 'locked') {
      throw new UnauthorizedException(
        `Account locked for ${lockoutMinutes} minutes due to ${maxAttempts} consecutive failed login attempts.`,
      );
    }
    if (outcome === 'unavailable') {
      throw new UnauthorizedException('Account is temporarily unavailable for sign-in.');
    }
    throw new UnauthorizedException(message);
  }

  private async verifyBackupCode(userId: string, code: string, hashedCodes: string[]): Promise<boolean> {
    for (const hash of hashedCodes) {
      if (!(await bcrypt.compare(code, hash))) continue;

      const removed = await this.prisma.$executeRaw`
        UPDATE "users"
        SET "twoFaBackupCodes" = array_remove("twoFaBackupCodes", ${hash}::text),
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${userId} AND ${hash}::text = ANY("twoFaBackupCodes")
      `;
      return removed === 1;
    }
    return false;
  }
}
