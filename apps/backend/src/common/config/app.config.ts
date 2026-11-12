import { registerAs } from '@nestjs/config';
import { randomBytes } from 'node:crypto';

const localSigningKeys = {
  access: randomBytes(32).toString('base64'),
  refresh: randomBytes(32).toString('base64'),
};

function requireSigningSecret(name: 'JWT_ACCESS_SECRET' | 'JWT_REFRESH_SECRET'): string {
  const value = process.env[name];
  if (!value || Buffer.byteLength(value.trim(), 'utf8') < 32 || /change-in-production|placeholder/i.test(value)) {
    throw new Error(`${name} must be set to a non-placeholder secret of at least 32 bytes in production.`);
  }
  return value;
}

function jwtConfig() {
  const production = process.env.NODE_ENV === 'production';
  const accessSecret = production
    ? requireSigningSecret('JWT_ACCESS_SECRET')
    : process.env.JWT_ACCESS_SECRET || localSigningKeys.access;
  const refreshSecret = production
    ? requireSigningSecret('JWT_REFRESH_SECRET')
    : process.env.JWT_REFRESH_SECRET || localSigningKeys.refresh;

  if (production && accessSecret === refreshSecret) {
    throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different in production.');
  }

  return {
    accessSecret,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshSecret,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  };
}

export const appConfig = registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '4000', 10),
  apiPrefix: process.env.API_PREFIX || 'api/v1',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',

  jwt: jwtConfig(),

  cookie: {
    secret: process.env.COOKIE_SECRET || 'cookie-secret',
    accessTokenName: 'access_token',
    refreshTokenName: 'refresh_token',
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
  },

  mail: {
    host: process.env.MAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.MAIL_PORT || '587', 10),
    secure: process.env.MAIL_SECURE === 'true',
    user: process.env.MAIL_USER,
    password: process.env.MAIL_PASSWORD,
    fromName: process.env.MAIL_FROM_NAME || 'ZenHR',
    fromAddress: process.env.MAIL_FROM_ADDRESS || 'noreply@zenhr.com',
  },

  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    premiumPriceId: process.env.STRIPE_PREMIUM_PRICE_ID,
  },

  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
  },

  security: {
    totpEncryptionKey: process.env.TOTP_ENCRYPTION_KEY,
    bcryptRounds: 12,
    maxLoginAttempts: 5,
    lockoutDurationMinutes: 15,
    supportModeDurationHours: 1,
  },
}));
