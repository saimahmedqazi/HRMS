import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export function rethrowMissingRecordAsConflict(error: unknown, message: string): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
    throw new ConflictException(message);
  }
  throw error;
}
