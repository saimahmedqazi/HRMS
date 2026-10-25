import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { authenticator } from 'otplib';
import * as qrcode from 'qrcode';
import * as crypto from 'crypto';
import * as geoip from 'geoip-lite';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MailService } from '../../common/mail/mail.service';
import { DataScopeService } from '../../common/services/data-scope.service';
import { RegisterCompanyDto } from './dto/register-company.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { CompanyStatus, UserRole, DataScope, LeaveType, EmployeeStatus } from '@prisma/client';

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
    private readonly dataScopeService: DataScopeService,
  ) {}

  async registerCompany(dto: RegisterCompanyDto): Promise<TokenResponse> {
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

    const tokens = await this.generateTokens(result.user.id, result.user.email, result.user.role, result.company.id);
    await this.storeRefreshTokenHash(result.user.id, tokens.refreshToken);

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
    ip: string,
    userAgent: string,
  ): Promise<
    | TokenResponse
    | { requires2fa: true; tempToken: string }
  > {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: { company: true, employee: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check account lockout
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesRemaining = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      throw new UnauthorizedException(
        `Account is temporarily locked due to multiple failed login attempts. Try again in ${minutesRemaining} minutes.`,
      );
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      const maxAttempts = this.configService.get<number>('app.security.maxLoginAttempts', 5);
      const lockoutMinutes = this.configService.get<number>('app.security.lockoutDurationMinutes', 15);
      const newAttempts = user.failedLoginAttempts + 1;

      if (newAttempts >= maxAttempts) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: 0,
            lockedUntil: new Date(Date.now() + lockoutMinutes * 60000),
          },
        });
        throw new UnauthorizedException(
          `Account locked for ${lockoutMinutes} minutes due to ${maxAttempts} consecutive failed login attempts.`,
        );
      } else {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { failedLoginAttempts: newAttempts },
        });
        throw new UnauthorizedException('Invalid credentials');
      }
    }

    // Check 2FA
    if (user.twoFaEnabled && user.twoFaSecret) {
      if (!dto.twoFactorCode) {
        // Issue short-lived temp token (5 min) for 2FA verification step
        const tempToken = this.jwtService.sign(
          { sub: user.id, is2faTemp: true },
          {
            secret: this.configService.get<string>('app.jwt.accessSecret'),
            expiresIn: '5m',
          },
        );
        return { requires2fa: true, tempToken };
      }

      const isTotpValid = authenticator.verify({
        token: dto.twoFactorCode,
        secret: user.twoFaSecret,
      });

      if (!isTotpValid) {
        // Check backup codes
        const backupValid = await this.verifyBackupCode(user.id, dto.twoFactorCode, user.twoFaBackupCodes);
        if (!backupValid) {
          throw new UnauthorizedException('Invalid two-factor code');
        }
      }
    }

    // Reset failed login attempts and capture IP location
    const geo = geoip.lookup(ip);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        lastLoginIp: ip,
        lastLoginUserAgent: userAgent.slice(0, 255),
        lastLoginCity: geo?.city || null,
        lastLoginCountry: geo?.country || null,
      },
    });

    const tokens = await this.generateTokens(user.id, user.email, user.role, user.companyId);
    await this.storeRefreshTokenHash(user.id, tokens.refreshToken);

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

  async verify2faLogin(tempToken: string, code: string): Promise<TokenResponse> {
    let payload: { sub: string; is2faTemp?: boolean };
    try {
      payload = this.jwtService.verify(tempToken, {
        secret: this.configService.get<string>('app.jwt.accessSecret'),
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

    if (!user || !user.twoFaSecret) {
      throw new UnauthorizedException('User not found or 2FA not enabled');
    }

    const isTotpValid = authenticator.verify({
      token: code,
      secret: user.twoFaSecret,
    });

    if (!isTotpValid) {
      const backupValid = await this.verifyBackupCode(user.id, code, user.twoFaBackupCodes);
      if (!backupValid) {
        throw new UnauthorizedException('Invalid two-factor code');
      }
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role, user.companyId);
    await this.storeRefreshTokenHash(user.id, tokens.refreshToken);

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
    let payload: { sub: string };
    try {
      payload = this.jwtService.verify(oldRefreshToken, {
        secret: this.configService.get<string>('app.jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || !user.refreshTokenHash) {
      throw new UnauthorizedException('Session expired');
    }

    const isTokenMatch = await bcrypt.compare(oldRefreshToken, user.refreshTokenHash);
    if (!isTokenMatch) {
      // Invalidate current refresh token to protect account from replay attack
      await this.prisma.user.update({
        where: { id: user.id },
        data: { refreshTokenHash: null },
      });
      throw new UnauthorizedException('Token replay detected. Please login again.');
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role, user.companyId);
    await this.storeRefreshTokenHash(user.id, tokens.refreshToken);

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

    if (!user) {
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
    const user = await this.prisma.user.findFirst({
      where: {
        passwordResetToken: dto.token,
        passwordResetExpiry: { gt: new Date() },
      },
    });

    if (!user) {
      throw new BadRequestException('Password reset token is invalid or has expired');
    }

    const saltRounds = this.configService.get<number>('app.security.bcryptRounds', 12);
    const passwordHash = await bcrypt.hash(dto.newPassword, saltRounds);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpiry: null,
        refreshTokenHash: null,
      },
    });
  }

  async verifyEmail(token: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { emailVerifyToken: token },
    });

    if (!user) {
      throw new BadRequestException('Invalid verification token');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isEmailVerified: true,
        emailVerifyToken: null,
      },
    });
  }

  async generateTotp(userId: string): Promise<{ secret: string; qrCodeDataUrl: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const secret = authenticator.generateSecret();
    const appName = 'ZenHR';
    const otpAuthUrl = authenticator.keyuri(user.email, appName, secret);
    const qrCodeDataUrl = await qrcode.toDataURL(otpAuthUrl);

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFaSecret: secret },
    });

    return { secret, qrCodeDataUrl };
  }

  async enableTotp(userId: string, code: string): Promise<{ backupCodes: string[] }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.twoFaSecret) {
      throw new BadRequestException('Please generate 2FA secret first');
    }

    const isValid = authenticator.verify({
      token: code,
      secret: user.twoFaSecret,
    });

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

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFaEnabled: true,
        twoFaBackupCodes: hashedCodes,
      },
    });

    return { backupCodes: plainCodes };
  }

  async disableTotp(userId: string, passwordConfirm: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const isMatch = await bcrypt.compare(passwordConfirm, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Incorrect password');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFaEnabled: false,
        twoFaSecret: null,
        twoFaBackupCodes: [],
      },
    });
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        twoFaEnabled: true,
        isEmailVerified: true,
        lastLoginAt: true,
        lastLoginCity: true,
        lastLoginCountry: true,
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
            department: { select: { id: true, name: true } },
            designation: { select: { id: true, name: true } },
            team: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  getAllowedModules(role: UserRole): string[] {
    return this.dataScopeService.getAllowedModules(role);
  }

  private async generateTokens(
    userId: string,
    email: string,
    role: UserRole,
    companyId: string | null,
    supportModeCompanyId?: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessSecret = this.configService.get<string>('app.jwt.accessSecret');
    const refreshSecret = this.configService.get<string>('app.jwt.refreshSecret');
    const accessExpiresIn = this.configService.get<string>('app.jwt.accessExpiresIn', '15m');
    const refreshExpiresIn = this.configService.get<string>('app.jwt.refreshExpiresIn', '7d');

    const payload = {
      sub: userId,
      email,
      role,
      companyId,
      ...(supportModeCompanyId ? { supportModeCompanyId } : {}),
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: accessSecret,
        expiresIn: accessExpiresIn,
      }),
      this.jwtService.signAsync(
        { sub: userId },
        {
          secret: refreshSecret,
          expiresIn: refreshExpiresIn,
        },
      ),
    ]);

    return { accessToken, refreshToken };
  }

  private async storeRefreshTokenHash(userId: string, refreshToken: string): Promise<void> {
    const hash = await bcrypt.hash(refreshToken, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: hash },
    });
  }

  private async verifyBackupCode(userId: string, code: string, hashedCodes: string[]): Promise<boolean> {
    for (let i = 0; i < hashedCodes.length; i++) {
      const isMatch = await bcrypt.compare(code, hashedCodes[i]);
      if (isMatch) {
        const updatedCodes = [...hashedCodes];
        updatedCodes.splice(i, 1);
        await this.prisma.user.update({
          where: { id: userId },
          data: { twoFaBackupCodes: updatedCodes },
        });
        return true;
      }
    }
    return false;
  }
}
