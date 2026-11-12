import { createHash } from 'node:crypto';

export const PASSWORD_SETUP_REQUIRED = '!password-setup-required';

// SHA-256 fingerprint of the retired shared bulk-import password.
const revokedImportPassword = '26ba458f5ecb258ee2a76303c5e38a39a45003fc82f9da792c1d03b1c1e491bd';

export function isRevokedImportPassword(password: string): boolean {
  return createHash('sha256').update(password).digest('hex') === revokedImportPassword;
}
