import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export const TOTP_SECRET_PREFIX = 'totp:v1:';

export function parseTotpEncryptionKey(value: string | undefined): Buffer {
  const encoded = value?.trim();
  const key = Buffer.from(encoded ?? '', 'base64');
  if (key.length !== 32 || key.toString('base64') !== encoded) {
    throw new Error('TOTP_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
  }
  return key;
}

export function encryptTotpSecret(secret: string, userId: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  cipher.setAAD(Buffer.from(userId));
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return TOTP_SECRET_PREFIX + [iv, cipher.getAuthTag(), encrypted]
    .map((part) => part.toString('base64url'))
    .join(':');
}

export function decryptTotpSecret(stored: string, userId: string, key: Buffer): string {
  if (!stored.startsWith(TOTP_SECRET_PREFIX)) {
    throw new Error('Invalid authenticator secret format.');
  }
  const parts = stored.slice(TOTP_SECRET_PREFIX.length).split(':');
  if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) {
    throw new Error('Invalid authenticator secret format.');
  }
  const [iv, tag, encrypted] = parts.map((part) => Buffer.from(part, 'base64url'));
  if (iv.length !== 12 || tag.length !== 16) {
    throw new Error('Invalid authenticator secret format.');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  decipher.setAAD(Buffer.from(userId));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

export function isLegacyTotpSecret(stored: string): boolean {
  return /^[A-Z2-7]+={0,6}$/i.test(stored);
}
