import { Socket } from 'node:net';
import { createHmac } from 'node:crypto';
import { getRequestIp, parseTrustedProxyRanges } from './request-ip';

describe('request IP resolution', () => {
  it('uses the address resolved by Express and normalizes an IPv4-mapped socket', () => {
    const socket = new Socket();
    Object.defineProperty(socket, 'remoteAddress', { value: '::ffff:127.0.0.1' });
    expect(getRequestIp({ ip: '192.0.2.4', socket })).toBe('192.0.2.4');
    expect(getRequestIp({ ip: undefined, socket })).toBe('127.0.0.1');
    socket.destroy();
  });

  it('accepts a fresh signed client IP and refuses forged or stale proxy headers', () => {
    const socket = new Socket();
    Object.defineProperty(socket, 'remoteAddress', { value: '100.64.0.8' });
    const secret = 'a-private-forwarding-secret-for-tests';
    const ip = '203.0.113.42';
    const timestamp = Date.now().toString();
    const signature = createHmac('sha256', secret).update(`${timestamp}\n${ip}`).digest('hex');
    const request = {
      ip: '100.64.0.8', socket,
      headers: {
        'x-zenhr-client-ip': ip,
        'x-zenhr-client-ip-timestamp': timestamp,
        'x-zenhr-client-ip-signature': signature,
      },
    };

    expect(getRequestIp(request, secret)).toBe(ip);
    expect(getRequestIp({ ...request, headers: { ...request.headers, 'x-zenhr-client-ip': '203.0.113.77' } }, secret)).toBeNull();
    expect(getRequestIp({ ...request, headers: { ...request.headers, 'x-zenhr-client-ip-timestamp': String(Date.now() - 120_000) } }, secret)).toBeNull();
    expect(getRequestIp({ ip: '100.64.0.8', socket, headers: { 'x-forwarded-for': ip } }, secret)).toBeNull();
    socket.destroy();
  });

  it('accepts an explicit list of ingress addresses and CIDRs', () => {
    expect(parseTrustedProxyRanges()).toEqual([]);
    expect(parseTrustedProxyRanges('127.0.0.1, 192.0.2.0/24, 2001:db8::/64')).toEqual([
      '127.0.0.1', '192.0.2.0/24', '2001:db8::/64',
    ]);
  });

  it.each(['true', '1', '0.0.0.0/0', '192.0.2.0/33'])('rejects invalid or unrestricted proxy setting %s', (value) => {
    expect(() => parseTrustedProxyRanges(value)).toThrow('TRUSTED_PROXY_CIDRS');
  });
});
