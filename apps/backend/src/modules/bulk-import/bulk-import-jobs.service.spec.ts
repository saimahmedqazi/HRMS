import { BulkImportStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import type { PrismaService } from '@common/prisma/prisma.service';
import { BulkImportJobsService } from './bulk-import-jobs.service';
import type { BulkImportService } from './bulk-import.service';

jest.mock('bullmq', () => ({
  Queue: jest.fn(),
  Worker: jest.fn(() => ({ on: jest.fn() })),
}));

describe('BulkImportJobsService submission', () => {
  it.each([
    [1, BulkImportStatus.FAILED],
    [0, BulkImportStatus.PROCESSING],
  ])('returns the stored status after an enqueue error with %i failed job updates', async (count, status) => {
    const jobs = {
      create: jest.fn().mockResolvedValue({ id: 'import-1', status: BulkImportStatus.QUEUED }),
      updateMany: jest.fn().mockResolvedValue({ count }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'import-1', status }),
    };
    jest.mocked(Queue).mockImplementation(() => ({
      on: jest.fn(),
      add: jest.fn().mockRejectedValue(new Error('Redis response lost')),
    }) as unknown as Queue);

    const service = new BulkImportJobsService({ bulkImportJob: jobs } as unknown as PrismaService, {} as BulkImportService);
    const originalUrl = process.env.REDIS_URL;
    try {
      process.env.REDIS_URL = 'redis://127.0.0.1:6379';
      service.onModuleInit();
    } finally {
      if (originalUrl === undefined) delete process.env.REDIS_URL;
      else process.env.REDIS_URL = originalUrl;
    }

    await expect(service.submit('company-1', 'user-1', Buffer.from('fixture'))).resolves.toEqual({ id: 'import-1', status });
    expect(jobs.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'import-1', status: BulkImportStatus.QUEUED } }));
    expect(jobs.findUniqueOrThrow).toHaveBeenCalledTimes(count === 0 ? 1 : 0);
  });
});
