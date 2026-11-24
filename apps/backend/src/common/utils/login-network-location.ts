import * as fs from 'node:fs';
import { isIP } from 'node:net';
import * as path from 'node:path';
import * as geoip from 'geoip-lite';
import * as maxmind from 'maxmind';
import type { CityResponse, Reader } from 'maxmind';
import { normalizeIpAddress } from './request-ip';

let ipv4Reader: Reader<CityResponse> | null | undefined;
let ipv6Reader: Reader<CityResponse> | null | undefined;

function openReader(fileName: string): Reader<CityResponse> | null {
  const candidates = [
    process.env.GEOIP_DB_DIR ? path.resolve(process.env.GEOIP_DB_DIR, fileName) : null,
    path.resolve(process.cwd(), 'data/geoip', fileName),
    path.resolve(process.cwd(), 'apps/backend/data/geoip', fileName),
  ].filter((p): p is string => Boolean(p));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        const buffer = fs.readFileSync(candidate);
        return new maxmind.Reader<CityResponse>(buffer);
      } catch {
        return null;
      }
    }
  }
  return null;
}

function getReader(version: 4 | 6): Reader<CityResponse> | null {
  if (version === 4) {
    if (ipv4Reader === undefined) ipv4Reader = openReader('dbip-city-ipv4.mmdb');
    return ipv4Reader;
  }
  if (ipv6Reader === undefined) ipv6Reader = openReader('dbip-city-ipv6.mmdb');
  return ipv6Reader;
}

function isPrivateOrLoopbackIp(ip: string): boolean {
  if (ip === '::1' || ip.startsWith('fe80:') || ip.startsWith('fc') || ip.startsWith('fd')) return true;
  if (isIP(ip) !== 4) return false;
  const parts = ip.split('.').map(Number);
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    parts[0] === 0 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127)
  );
}

export function getLoginNetworkLocation(ip?: string | null) {
  const lastLoginIp = normalizeIpAddress(ip ?? undefined);
  if (!lastLoginIp || isPrivateOrLoopbackIp(lastLoginIp)) {
    return {
      lastLoginIp,
      lastLoginCity: null,
      lastLoginCountry: null,
      lastLoginLatitude: null,
      lastLoginLongitude: null,
      lastLoginLocation: null,
    };
  }

  const version = isIP(lastLoginIp);
  const reader = version === 4 || version === 6 ? getReader(version) : null;
  if (reader) {
    try {
      const mmdb = reader.get(lastLoginIp) as (CityResponse & {
        city?: string | CityResponse['city'];
        country_code?: string;
        latitude?: number;
        longitude?: number;
      }) | null;
      if (mmdb) {
        const lastLoginCity =
          typeof mmdb.city === 'string'
            ? mmdb.city || null
            : mmdb.city?.names?.en || null;
        const lastLoginCountry =
          mmdb.country_code || mmdb.country?.iso_code || null;
        const lastLoginLatitude =
          typeof mmdb.latitude === 'number'
            ? mmdb.latitude
            : mmdb.location?.latitude ?? null;
        const lastLoginLongitude =
          typeof mmdb.longitude === 'number'
            ? mmdb.longitude
            : mmdb.location?.longitude ?? null;
        return {
          lastLoginIp,
          lastLoginCity,
          lastLoginCountry,
          lastLoginLatitude,
          lastLoginLongitude,
          lastLoginLocation: [lastLoginCity, lastLoginCountry].filter(Boolean).join(', ') || null,
        };
      }
    } catch {
      // Fall back gracefully without breaking authentication
    }
  }

  try {
    const location = geoip.lookup(lastLoginIp);
    const lastLoginCity = location?.city || null;
    const lastLoginCountry = location?.country || null;
    return {
      lastLoginIp,
      lastLoginCity,
      lastLoginCountry,
      lastLoginLatitude: location?.ll?.[0] ?? null,
      lastLoginLongitude: location?.ll?.[1] ?? null,
      lastLoginLocation: [lastLoginCity, lastLoginCountry].filter(Boolean).join(', ') || null,
    };
  } catch {
    return {
      lastLoginIp,
      lastLoginCity: null,
      lastLoginCountry: null,
      lastLoginLatitude: null,
      lastLoginLongitude: null,
      lastLoginLocation: null,
    };
  }
}

export interface TelemetryUserInput {
  lastLoginIp?: string | null;
  lastLoginLatitude?: number | null;
  lastLoginLongitude?: number | null;
  lastLoginLocationAccuracy?: number | null;
  lastLoginLocationSource?: string | null;
  lastLoginLocationCapturedAt?: Date | string | null;
  employee?: { locationConsent?: boolean | null } | null;
}

export function resolveLoginTelemetry(user: TelemetryUserInput) {
  const ipLocation = getLoginNetworkLocation(user.lastLoginIp);
  const hasConsentedBrowser =
    user.lastLoginLocationSource === 'BROWSER' &&
    user.employee?.locationConsent === true &&
    typeof user.lastLoginLatitude === 'number' &&
    Number.isFinite(user.lastLoginLatitude) &&
    typeof user.lastLoginLongitude === 'number' &&
    Number.isFinite(user.lastLoginLongitude);

  if (hasConsentedBrowser) {
    return {
      lastLoginIp: ipLocation.lastLoginIp,
      lastLoginCity: null,
      lastLoginCountry: null,
      lastLoginLatitude: user.lastLoginLatitude!,
      lastLoginLongitude: user.lastLoginLongitude!,
      lastLoginLocation: null,
      lastLoginLocationSource: 'BROWSER' as const,
      lastLoginLocationAccuracy: user.lastLoginLocationAccuracy ?? null,
      lastLoginLocationCapturedAt: user.lastLoginLocationCapturedAt ?? null,
      approximateIpLocation: ipLocation.lastLoginLocation || ipLocation.lastLoginLatitude != null
        ? {
            city: ipLocation.lastLoginCity,
            country: ipLocation.lastLoginCountry,
            latitude: ipLocation.lastLoginLatitude,
            longitude: ipLocation.lastLoginLongitude,
            label: ipLocation.lastLoginLocation,
          }
        : null,
    };
  }

  const hasIpLocation = ipLocation.lastLoginLocation !== null ||
    (ipLocation.lastLoginLatitude !== null && ipLocation.lastLoginLongitude !== null);

  return {
    lastLoginIp: ipLocation.lastLoginIp,
    lastLoginCity: ipLocation.lastLoginCity,
    lastLoginCountry: ipLocation.lastLoginCountry,
    lastLoginLatitude: ipLocation.lastLoginLatitude,
    lastLoginLongitude: ipLocation.lastLoginLongitude,
    lastLoginLocation: ipLocation.lastLoginLocation,
    lastLoginLocationSource: hasIpLocation ? ('IP' as const) : null,
    lastLoginLocationAccuracy: null,
    lastLoginLocationCapturedAt: null,
    approximateIpLocation: hasIpLocation
      ? {
          city: ipLocation.lastLoginCity,
          country: ipLocation.lastLoginCountry,
          latitude: ipLocation.lastLoginLatitude,
          longitude: ipLocation.lastLoginLongitude,
          label: ipLocation.lastLoginLocation,
        }
      : null,
  };
}
