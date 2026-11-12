import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Req,
  Res,
  Query,
  UseGuards,
  HttpCode,
  Header,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SessionProbe } from '../../common/guards/request-throttler.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { getRequestIp } from '../../common/utils/request-ip';
import { RegisterCompanyDto } from './dto/register-company.dto';
import { LoginDto } from './dto/login.dto';
import { LocationConsentDto } from './dto/location-consent.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { DisableTotpDto, VerifyTotpDto, VerifyTwoFactorLoginDto } from './dto/totp.dto';
import { UserRole } from '@prisma/client';

@ApiTags('auth')
@Controller('auth')
@UseGuards(JwtAuthGuard)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Post('register')
  @Throttle({ short: { limit: 15, ttl: 60000 } })
  @ApiOperation({ summary: 'Register a new company and company admin user' })
  @ApiResponse({ status: 201, description: 'Company and admin registered successfully' })
  async register(
    @Body() dto: RegisterCompanyDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.registerCompany(dto);
    this.setAuthCookies(res, result.accessToken, result.refreshToken);
    return { user: result.user };
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, description: 'Authenticated successfully or 2FA challenge' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userAgent = req.headers['user-agent'] || 'Unknown';

    const result = await this.authService.login(dto, getRequestIp(req), userAgent);

    if ('requires2fa' in result) {
      return result;
    }

    this.setAuthCookies(res, result.accessToken, result.refreshToken);
    return { user: result.user };
  }

  @Public()
  @Post('login/2fa')
  @Throttle({ short: { limit: 15, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete two-factor authentication challenge' })
  async verify2faLogin(
    @Body() dto: VerifyTwoFactorLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userAgent = req.headers['user-agent'] || 'Unknown';

    const result = await this.authService.verify2faLogin(dto.tempToken, dto.code, getRequestIp(req), userAgent);
    this.setAuthCookies(res, result.accessToken, result.refreshToken);
    return { user: result.user };
  }

  @Public()
  @Post('refresh')
  @SessionProbe('refresh_token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate and refresh JWT access token using httpOnly cookie' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.['refresh_token'];
    if (!refreshToken) {
      throw new UnauthorizedException('No refresh token provided');
    }

    const tokens = await this.authService.refreshToken(refreshToken);
    this.setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
    return { message: 'Token refreshed successfully' };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout and clear authentication cookies' })
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logout((user.id || user.sub)!);
    this.clearAuthCookies(res);
    return { message: 'Logged out successfully' };
  }

  @Public()
  @Post('forgot-password')
  @Throttle({ short: { limit: 15, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset email' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email);
    return { message: 'If that email is registered, a password reset link has been sent.' };
  }

  @Public()
  @Post('reset-password')
  @Throttle({ short: { limit: 15, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password with reset token' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto);
    return { message: 'Password has been successfully reset. Please log in with your new password.' };
  }

  @Public()
  @Get('verify-email')
  @ApiOperation({ summary: 'Verify email address with verification token' })
  async verifyEmail(@Query('token') token: string) {
    await this.authService.verifyEmail(token);
    return { message: 'Email verified successfully.' };
  }

  @Post('2fa/generate')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Generate TOTP 2FA secret and QR code' })
  async generateTotp(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.generateTotp((user.id || user.sub)!);
  }

  @Post('2fa/enable')
  @Header('Cache-Control', 'no-store')
  @Throttle({ short: { limit: 15, ttl: 60000 } })
  @ApiOperation({ summary: 'Verify TOTP code and enable 2FA' })
  async enableTotp(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VerifyTotpDto,
  ) {
    return this.authService.enableTotp((user.id || user.sub)!, dto.code);
  }

  @Post('2fa/disable')
  @Throttle({ short: { limit: 15, ttl: 60000 } })
  @ApiOperation({ summary: 'Disable 2FA' })
  async disableTotp(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DisableTotpDto,
  ) {
    await this.authService.disableTotp((user.id || user.sub)!, dto.password);
    return { message: 'Two-factor authentication disabled' };
  }

  @Get('me')
  @SessionProbe('access_token')
  @ApiOperation({ summary: 'Get current user profile, company, and employee context' })
  async getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getMe((user.id || user.sub)!, user.supportModeCompanyId);
  }

  @Patch('me/location-consent')
  @ApiOperation({ summary: 'Set device location consent for your attendance punches' })
  async updateLocationConsent(@CurrentUser() user: AuthenticatedUser, @Body() dto: LocationConsentDto) {
    return this.authService.updateLocationConsent((user.id || user.sub)!, user.companyId, dto.locationConsent);
  }

  @Get('me/modules')
  @ApiOperation({ summary: 'Get allowed modules manifest for current user role (server-driven sidebar)' })
  async getMyModules(@CurrentUser() user: AuthenticatedUser) {
    if (user.role === UserRole.SUPER_ADMIN && user.supportModeCompanyId) {
      const superModules = this.authService.getAllowedModules(UserRole.SUPER_ADMIN);
      const adminModules = this.authService.getAllowedModules(UserRole.COMPANY_ADMIN)
        .filter((module) => module !== 'payroll');
      const merged = Array.from(new Set([...superModules, ...adminModules]));
      return {
        role: user.role,
        supportModeCompanyId: user.supportModeCompanyId,
        allowedModules: merged,
      };
    }
    const modules = this.authService.getAllowedModules(user.role as UserRole);
    return { role: user.role, allowedModules: modules };
  }

  private setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
    const isProd = this.configService.get<string>('app.nodeEnv') === 'production';

    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000, // 15 minutes
      path: '/',
    });

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/',
    });
  }

  private clearAuthCookies(res: Response) {
    const isProd = this.configService.get<string>('app.nodeEnv') === 'production';

    res.clearCookie('access_token', {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
    });

    res.clearCookie('refresh_token', {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
    });
  }
}
