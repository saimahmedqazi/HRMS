import { isIP } from 'node:net';
import type { Request } from 'express';

export function normalizeIpAddress(value?: string): string | null {
  const address = value?.trim();
  if (!address || !isIP(address)) return null;
  const mapped = address.replace(/^::ffff:/i, '');
  return isIP(mapped) === 4 ? mapped : address;
}

export function getRequestIp(req: Pick<Request, 'ip' | 'socket'>): string | null {
  return normalizeIpAddress(req.ip) ?? normalizeIpAddress(req.socket.remoteAddress);
}

export function parseTrustedProxyRanges(value?: string): string[] {
  const ranges = value?.split(',').map((range) => range.trim()).filter(Boolean) ?? [];
  for (const range of ranges) {
    const [address, prefix, extra] = range.split('/');
    const version = isIP(address);
    const maxPrefix = version === 4 ? 32 : 128;
    if (
      !version || extra !== undefined ||
      (prefix !== undefined && (!/^\d+$/.test(prefix) || Number(prefix) < 1 || Number(prefix) > maxPrefix))
    ) {
      throw new Error('TRUSTED_PROXY_CIDRS must contain specific IPv4 or IPv6 addresses or CIDR ranges.');
    }
  }
  return ranges;
}
