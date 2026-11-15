import { isIP } from 'node:net';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

const FORWARDED_IP_MAX_AGE_MS = 60_000;
type IpRequest = Pick<Request, 'ip' | 'socket'> & Partial<Pick<Request, 'headers'>>;

export function normalizeIpAddress(value?: string): string | null {
  const address = value?.trim();
  if (!address || !isIP(address)) return null;
  const mapped = address.replace(/^::ffff:/i, '');
  return isIP(mapped) === 4 ? mapped : address;
}

export function getRequestIp(req: IpRequest, forwardingSecret = process.env.IP_FORWARDING_SECRET): string | null {
  if (forwardingSecret) {
    const ipHeader = req.headers?.['x-zenhr-client-ip'];
    const timestampHeader = req.headers?.['x-zenhr-client-ip-timestamp'];
    const signatureHeader = req.headers?.['x-zenhr-client-ip-signature'];
    if (typeof ipHeader !== 'string' || typeof timestampHeader !== 'string' ||
        typeof signatureHeader !== 'string' || !/^\d{13}$/.test(timestampHeader) ||
        !/^[a-f0-9]{64}$/i.test(signatureHeader)) return null;

    const ip = normalizeIpAddress(ipHeader);
    const age = Math.abs(Date.now() - Number(timestampHeader));
    if (!ip || age > FORWARDED_IP_MAX_AGE_MS) return null;

    const expected = createHmac('sha256', forwardingSecret)
      .update(`${timestampHeader}\n${ipHeader}`).digest();
    const received = Buffer.from(signatureHeader, 'hex');
    return timingSafeEqual(expected, received) ? ip : null;
  }
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
