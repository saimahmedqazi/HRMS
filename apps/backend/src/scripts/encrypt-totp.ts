import { PrismaClient } from '@prisma/client';
import {
  encryptTotpSecret,
  isLegacyTotpSecret,
  parseTotpEncryptionKey,
  TOTP_SECRET_PREFIX,
} from '../modules/auth/totp-secret';

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('Set DATABASE_URL explicitly before running the authenticator backfill.');
  const key = parseTotpEncryptionKey(process.env.TOTP_ENCRYPTION_KEY);
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  let encrypted = 0;
  let unrecognized = 0;
  let afterId: string | undefined;

  try {
    while (true) {
      const users = await prisma.user.findMany({
        where: {
          id: afterId ? { gt: afterId } : undefined,
          twoFaSecret: { not: null },
          NOT: { twoFaSecret: { startsWith: TOTP_SECRET_PREFIX } },
        },
        orderBy: { id: 'asc' },
        select: { id: true, twoFaSecret: true },
        take: 200,
      });
      if (users.length === 0) break;

      for (const { id, twoFaSecret } of users) {
        if (!twoFaSecret || !isLegacyTotpSecret(twoFaSecret)) {
          unrecognized++;
          continue;
        }
        const updated = await prisma.user.updateMany({
          where: { id, twoFaSecret },
          data: { twoFaSecret: encryptTotpSecret(twoFaSecret, id, key) },
        });
        encrypted += updated.count;
      }
      afterId = users[users.length - 1].id;
    }
  } catch {
    throw new Error('Authenticator backfill could not complete. Verify the database connection and rerun it.');
  } finally {
    await prisma.$disconnect();
  }
  console.log(`Encrypted authenticator secrets: ${encrypted}. Unrecognized stored secrets: ${unrecognized}.`);
  if (unrecognized > 0) process.exitCode = 1;
}

void main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
