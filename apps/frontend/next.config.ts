import type { NextConfig } from 'next';
import path from 'node:path';

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
