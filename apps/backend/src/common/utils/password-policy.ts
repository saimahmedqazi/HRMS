import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';

export const PASSWORD_SETUP_REQUIRED = '!password-setup-required';

// SHA-256 fingerprint of the retired shared bulk-import password.
const revokedImportPassword = '26ba458f5ecb258ee2a76303c5e38a39a45003fc82f9da792c1d03b1c1e491bd';

export function isRevokedImportPassword(password: string): boolean {
  return createHash('sha256').update(password).digest('hex') === revokedImportPassword;
}

export function validateStrongPassword(password: string): void {
  if (typeof password !== 'string' || password.length < 8) {
    throw new BadRequestException('Password must be at least 8 characters long.');
  }
  if (Buffer.byteLength(password, 'utf8') > 72) {
    throw new BadRequestException('Password must be at most 72 bytes in UTF-8.');
  }
  if (isRevokedImportPassword(password)) {
    throw new BadRequestException('Choose a different password.');
  }
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
    throw new BadRequestException('Password must include uppercase, lowercase, and numeric characters.');
  }
}
