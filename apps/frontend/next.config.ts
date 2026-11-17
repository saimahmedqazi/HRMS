import type { NextConfig } from 'next';
import path from 'node:path';

const developmentScriptPolicy = process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : '';

function getApiOrigin() {
  const configuredOrigin = process.env.NEXT_PUBLIC_API_URL?.trim();
  const value = configuredOrigin || 'http://localhost:4000';
  const url = URL.canParse(value) ? new URL(value) : null;
  if (!url || !['http:', 'https:'].includes(url.protocol) || url.pathname !== '/' ||
    url.search || url.hash || url.username || url.password) {
    throw new Error('NEXT_PUBLIC_API_URL must be an HTTP or HTTPS origin without a path, query, fragment, or credentials.');
  }
  if (process.env.VERCEL === '1' && (!configuredOrigin || url.protocol !== 'https:' ||
    /(?:^|\.)localhost\.?$|^127\.|^0\.0\.0\.0$|^\[::1\]$/i.test(url.hostname))) {
    throw new Error('Set NEXT_PUBLIC_API_URL in Vercel to the public HTTPS origin of the API or tunnel, then redeploy.');
  }
  return url.origin;
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.resolve(__dirname, '../../'),
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'unsafe-inline'${developmentScriptPolicy}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' wss:; worker-src 'self' blob:`,
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
        ],
      },
    ];
  },
  async rewrites() {
    const apiOrigin = getApiOrigin();
    return [
      {
        source: '/api/attendance-events',
        destination: `${apiOrigin}/socket.io/`,
      },
      {
        source: '/api/:path*',
        destination: `${apiOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
