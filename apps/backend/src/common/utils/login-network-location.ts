import * as geoip from 'geoip-lite';
import { normalizeIpAddress } from './request-ip';

export function getLoginNetworkLocation(ip?: string | null) {
  const lastLoginIp = normalizeIpAddress(ip ?? undefined);
  const location = lastLoginIp ? geoip.lookup(lastLoginIp) : null;
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
}
