import { getLoginNetworkLocation, resolveLoginTelemetry } from './login-network-location';

describe('HR-10 IP Geolocation & Telemetry Priority', () => {
  it('resolves 144.48.129.225 via local MMDB to Pakistan (PK) instead of Hong Kong', () => {
    const loc = getLoginNetworkLocation('144.48.129.225');
    expect(loc.lastLoginIp).toBe('144.48.129.225');
    expect(loc.lastLoginCountry).toBe('PK');
    expect(loc.lastLoginLatitude).toBeCloseTo(24.84, 1);
    expect(loc.lastLoginLongitude).toBeCloseTo(66.92, 1);
  });

  it('handles private and loopback IPv4/IPv6 addresses gracefully', () => {
    for (const ip of ['127.0.0.1', '::1', '192.168.1.5', '10.0.0.1', '::ffff:127.0.0.1']) {
      const loc = getLoginNetworkLocation(ip);
      expect(loc.lastLoginLocation).toBeNull();
      expect(loc.lastLoginLatitude).toBeNull();
      expect(loc.lastLoginLongitude).toBeNull();
    }
  });

  it('prioritizes consented browser coordinates over IP location without mixing IP city', () => {
    const resolved = resolveLoginTelemetry({
      lastLoginIp: '144.48.129.225',
      lastLoginLatitude: 33.6844,
      lastLoginLongitude: 73.0479,
      lastLoginLocationAccuracy: 18,
      lastLoginLocationSource: 'BROWSER',
      lastLoginLocationCapturedAt: '2026-11-24T15:00:00.000Z',
      employee: { locationConsent: true },
    });

    expect(resolved.lastLoginLocationSource).toBe('BROWSER');
    expect(resolved.lastLoginLatitude).toBe(33.6844);
    expect(resolved.lastLoginLongitude).toBe(73.0479);
    expect(resolved.lastLoginLocationAccuracy).toBe(18);
    expect(resolved.lastLoginLocation).toBeNull();
    expect(resolved.approximateIpLocation?.country).toBe('PK');
  });

  it('falls back to IP location when consent is revoked or absent', () => {
    const resolved = resolveLoginTelemetry({
      lastLoginIp: '144.48.129.225',
      lastLoginLatitude: 33.6844,
      lastLoginLongitude: 73.0479,
      lastLoginLocationSource: 'BROWSER',
      employee: { locationConsent: false },
    });

    expect(resolved.lastLoginLocationSource).toBe('IP');
    expect(resolved.lastLoginCountry).toBe('PK');
    expect(resolved.lastLoginLatitude).toBeCloseTo(24.84, 1);
  });
});
