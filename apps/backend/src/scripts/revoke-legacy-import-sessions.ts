import { PrismaClient, UserRole } from '@prisma/client';
import { compare } from 'bcrypt';
import { isRevokedImportPassword, PASSWORD_SETUP_REQUIRED } from '../common/utils/password-policy';

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const retiredPassword = process.env.ZENHR_RETIRED_IMPORT_PASSWORD;
  if (!databaseUrl) throw new Error('Set DATABASE_URL explicitly before reviewing historical imports.');
  if (!retiredPassword || !isRevokedImportPassword(retiredPassword)) {
    throw new Error('Set ZENHR_RETIRED_IMPORT_PASSWORD to the retired import credential.');
  }

  const args = process.argv.slice(2);
  const apply = args[0] === '--apply';
  if (args.length && (args.length !== 1 || !apply)) throw new Error('Use no arguments for a dry run or pass --apply.');

  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  let matched = 0;
  let updated = 0;
  let afterId: string | undefined;
  try {
    while (true) {
      const accounts = await prisma.user.findMany({
        where: {
          id: afterId ? { gt: afterId } : undefined,
          role: UserRole.EMPLOYEE,
          companyId: { not: null },
          deletedAt: null,
          passwordHash: { startsWith: '$2' },
        },
        select: { id: true, passwordHash: true },
        orderBy: { id: 'asc' },
        take: 200,
      });
      if (!accounts.length) break;

      const matchedHashes = new Map<string, boolean>();
      for (const { id, passwordHash } of accounts) {
        const matches = matchedHashes.get(passwordHash) ?? await compare(retiredPassword, passwordHash);
        matchedHashes.set(passwordHash, matches);
        if (!matches) continue;
        matched++;
        if (!apply) continue;

        const result = await prisma.user.updateMany({
          where: { id, passwordHash, deletedAt: null },
          data: {
            passwordHash: PASSWORD_SETUP_REQUIRED,
            sessionVersion: { increment: 1 },
            refreshTokenHash: null,
            passwordResetToken: null,
            passwordResetExpiry: null,
            failedLoginAttempts: 0,
            lockedUntil: null,
          },
        });
        updated += result.count;
      }
      afterId = accounts[accounts.length - 1].id;
    }
  } catch {
    throw new Error(`Legacy import review could not complete. Accounts updated before failure: ${updated}. The command can be rerun.`);
  } finally {
    await prisma.$disconnect();
  }
  console.log(`${apply ? 'Apply' : 'Dry run'}. Accounts matching retired credential: ${matched}. Accounts updated: ${updated}.`);
}

void main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
