import { decryptTotpSecret, encryptTotpSecret, isLegacyTotpSecret, parseTotpEncryptionKey } from './totp-secret';

describe('stored authenticator secrets', () => {
  const key = Buffer.alloc(32, 19);
  const secret = 'JBSWY3DPEHPK3PXP';

  it('round-trips with a fresh nonce for each write', () => {
    const first = encryptTotpSecret(secret, 'user-1', key);
    const second = encryptTotpSecret(secret, 'user-1', key);
    expect(first).not.toBe(second);
    expect(decryptTotpSecret(first, 'user-1', key)).toBe(secret);
    expect(isLegacyTotpSecret(first)).toBe(false);
    expect(isLegacyTotpSecret(secret)).toBe(true);
  });

  it('rejects a ciphertext for a different account or key', () => {
    const stored = encryptTotpSecret(secret, 'user-1', key);
    expect(() => decryptTotpSecret(stored, 'user-2', key)).toThrow();
    expect(() => decryptTotpSecret(stored, 'user-1', Buffer.alloc(32, 20))).toThrow();
  });

  it('requires a canonical base64-encoded 32-byte key', () => {
    expect(parseTotpEncryptionKey(key.toString('base64'))).toEqual(key);
    expect(() => parseTotpEncryptionKey('fixture-missing-valid-key')).toThrow('TOTP_ENCRYPTION_KEY');
    expect(() => parseTotpEncryptionKey(undefined)).toThrow('TOTP_ENCRYPTION_KEY');
  });
});
