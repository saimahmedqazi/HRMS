import { DataScope, Prisma, PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { isEmail } from 'class-validator';

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('Set DATABASE_URL explicitly before provisioning the initial platform administrator.');

  const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  if (!email || !isEmail(email)) throw new Error('Set SUPER_ADMIN_EMAIL to a valid administrator email.');

  const password = process.env.SUPER_ADMIN_PASSWORD;
  if (!password || password.trim().length < 16 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('Set SUPER_ADMIN_PASSWORD to a unique password of at least 16 characters and at most 72 bytes.');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  try {
    const result = await prisma.$transaction(async (tx) => {
      const existingAdmin = await tx.user.findFirst({
        where: { role: UserRole.SUPER_ADMIN, companyId: null, deletedAt: null },
        select: { email: true },
      });
      if (existingAdmin) return existingAdmin.email === email ? 'already-created' : 'another-admin';

      await tx.user.create({
        data: {
          email,
          passwordHash,
          role: UserRole.SUPER_ADMIN,
          dataScope: DataScope.PLATFORM,
          isEmailVerified: true,
        },
      });
      return 'created';
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (result === 'another-admin') {
      console.error('A platform administrator already exists. Use the existing account to manage access.');
      process.exitCode = 1;
    } else {
      console.log(result === 'created'
        ? 'Initial platform administrator created.'
        : 'The initial platform administrator already exists.');
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') throw new Error('The requested email belongs to an existing account.');
      if (error.code === 'P2034') throw new Error('Administrator setup changed concurrently. Rerun the command to confirm the result.');
    }
    throw new Error('Administrator setup could not complete. Verify the database connection and applied migrations.');
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
