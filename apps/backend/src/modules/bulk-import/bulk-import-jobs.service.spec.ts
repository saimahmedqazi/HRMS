import { BulkImportStatus } from '@prisma/client';
import { Queue, Worker } from 'bullmq';
import type { PrismaService } from '@common/prisma/prisma.service';
import { BulkImportJobsService } from './bulk-import-jobs.service';
import type { BulkImportService } from './bulk-import.service';

jest.mock('bullmq', () => ({
  Queue: jest.fn(),
  Worker: jest.fn(() => ({ on: jest.fn() })),
}));

describe('BulkImportJobsService submission', () => {
  it('starts both the queue and worker with the hosted split Redis settings', () => {
    const originalEnv = process.env;
    process.env = { ...originalEnv, REDIS_HOST: 'fixture.upstash.io', REDIS_PORT: '6380', REDIS_PASSWORD: 'fixture-password' };
    delete process.env.REDIS_URL;
    jest.mocked(Queue).mockReturnValue({ on: jest.fn() } as unknown as Queue);
    try {
      const service = new BulkImportJobsService({} as PrismaService, {} as BulkImportService);
      service.onModuleInit();
      const connection = expect.objectContaining({
        host: 'fixture.upstash.io',
        port: 6380,
        password: 'fixture-password',
        tls: {},
      });
      expect(Queue).toHaveBeenLastCalledWith('zenhr-employee-imports', expect.objectContaining({ connection }));
      expect(Worker).toHaveBeenLastCalledWith('zenhr-employee-imports', expect.any(Function), expect.objectContaining({ connection }));
    } finally {
      process.env = originalEnv;
    }
  });

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

  it('disables the Redis queue and worker once when Upstash exceeds max requests limit', async () => {
    const queueClose = jest.fn().mockResolvedValue(undefined);
    const workerClose = jest.fn().mockResolvedValue(undefined);
    let workerErrorHandler: ((err: Error) => void) | undefined;

    jest.mocked(Queue).mockImplementation(() => ({
      on: jest.fn(),
      close: queueClose,
    }) as unknown as Queue);
    jest.mocked(Worker).mockImplementation(() => ({
      on: jest.fn((event: string, cb: (err: Error) => void) => {
        if (event === 'error') workerErrorHandler = cb;
      }),
      close: workerClose,
    }) as unknown as Worker);

    const service = new BulkImportJobsService({} as PrismaService, {} as BulkImportService);
    const originalUrl = process.env.REDIS_URL;
    try {
      process.env.REDIS_URL = 'rediss://default:secret@inspired-lynx.upstash.io:6379';
      service.onModuleInit();
    } finally {
      if (originalUrl === undefined) delete process.env.REDIS_URL;
      else process.env.REDIS_URL = originalUrl;
    }

    expect(workerErrorHandler).toBeDefined();
    workerErrorHandler?.(new Error('ERR max requests limit exceeded. Limit: 500000, Usage: 500001.'));
    workerErrorHandler?.(new Error('ERR max requests limit exceeded. Limit: 500000, Usage: 500002.'));

    expect(workerClose).toHaveBeenCalledTimes(1);
    expect(queueClose).toHaveBeenCalledTimes(1);
  });
});
