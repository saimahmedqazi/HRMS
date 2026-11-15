import { NextResponse, type NextRequest } from 'next/server';

const forwardedHeaders = [
  'x-zenhr-client-ip',
  'x-zenhr-client-ip-timestamp',
  'x-zenhr-client-ip-signature',
] as const;

export async function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  for (const name of forwardedHeaders) headers.delete(name);

  const secret = process.env.IP_FORWARDING_SECRET;
  const clientIp = request.headers.get('x-forwarded-for')?.trim();
  if (!secret || !clientIp || clientIp.length > 64 || clientIp.includes(',')) {
    return NextResponse.next({ request: { headers } });
  }

  const timestamp = Date.now().toString();
  const encoder = new TextEncoder();
  if (encoder.encode(secret).length < 32) {
    throw new Error('IP_FORWARDING_SECRET must contain at least 32 bytes when configured.');
  }
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}\n${clientIp}`));

  headers.set('x-zenhr-client-ip', clientIp);
  headers.set('x-zenhr-client-ip-timestamp', timestamp);
  headers.set('x-zenhr-client-ip-signature',
    Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join(''));
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: '/api/:path*' };
