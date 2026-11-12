import { Socket } from 'node:net';
import { getRequestIp, parseTrustedProxyRanges } from './request-ip';

describe('request IP resolution', () => {
  it('uses the address resolved by Express and normalizes an IPv4-mapped socket', () => {
    const socket = new Socket();
    Object.defineProperty(socket, 'remoteAddress', { value: '::ffff:127.0.0.1' });
    expect(getRequestIp({ ip: '192.0.2.4', socket })).toBe('192.0.2.4');
    expect(getRequestIp({ ip: undefined, socket })).toBe('127.0.0.1');
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
