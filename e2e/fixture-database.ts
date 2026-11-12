import { PrismaClient } from '@prisma/client';

export function openFixtureDatabase() {
  const connection = process.env.ZENHR_E2E_DATABASE_URL;
  if (!connection) {
    throw new Error('Set ZENHR_E2E_DATABASE_URL to the disposable PostgreSQL database used by the test API.');
  }
  const url = new URL(connection);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new Error('Database-backed Playwright tests require disposable PostgreSQL on loopback.');
  }
  return new PrismaClient({ datasourceUrl: connection });
}
