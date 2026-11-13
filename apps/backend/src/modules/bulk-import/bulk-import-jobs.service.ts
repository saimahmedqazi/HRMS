import {
  BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BulkImportStatus, Prisma, UserRole } from '@prisma/client';
import { ConnectionOptions, Job, Queue, Worker } from 'bullmq';
import { PrismaService } from '@common/prisma/prisma.service';
import { BulkImportService, PreparedImportRow, RowError } from './bulk-import.service';
import { isInactiveAccount } from '../auth/account-state';

type ImportPayload = { workbook?: string };
const QUEUE_NAME = 'zenhr-employee-imports';
const pendingStatuses: BulkImportStatus[] = [BulkImportStatus.QUEUED, BulkImportStatus.PROCESSING];
const JOB_FAILURE = 'The import stopped before all rows were processed. Review the results before retrying.';

@Injectable()
export class BulkImportJobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BulkImportJobsService.name);
  private queue?: Queue<ImportPayload>;
  private worker?: Worker<ImportPayload>;
  private reconciling = false;

  constructor(private readonly prisma: PrismaService, private readonly imports: BulkImportService) {}

  onModuleInit() {
    if (!process.env.REDIS_URL) return;
    const redis = new URL(process.env.REDIS_URL);
    if (!['redis:', 'rediss:'].includes(redis.protocol)) throw new Error('REDIS_URL must use redis or rediss.');
    const connection: ConnectionOptions = {
      host: redis.hostname,
      port: Number(redis.port || 6379),
      username: decodeURIComponent(redis.username) || undefined,
      password: decodeURIComponent(redis.password) || undefined,
      db: Number(redis.pathname.slice(1) || 0),
      ...(redis.protocol === 'rediss:' && { tls: {} }),
    };
    this.queue = new Queue(QUEUE_NAME, {
      connection: { ...connection, maxRetriesPerRequest: 1, enableOfflineQueue: false, commandTimeout: 5000 },
      defaultJobOptions: {
        attempts: 4,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { age: 3600, count: 1000 },
        removeOnFail: { age: 86400, count: 1000 },
      },
    });
    this.worker = new Worker(QUEUE_NAME, (job: Job<ImportPayload>) => this.process(job), {
      connection: { ...connection, maxRetriesPerRequest: null },
    });
    this.queue.on('error', () => this.logger.warn('Bulk import queue connection is unavailable.'));
    this.worker.on('error', () => this.logger.warn('Bulk import worker connection is unavailable.'));
    this.worker.on('failed', (job) => {
      if (job?.id) void this.recordTerminalFailure(job).catch(() => this.logger.warn('Could not record bulk import failure.'));
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }

  async submit(companyId: string, submittedById: string, workbook: Buffer, supportModeSessionId?: string) {
    if (!this.queue) throw new ServiceUnavailableException('Background imports are unavailable. Try again later.');
    const job = await this.prisma.bulkImportJob.create({
      data: { companyId, submittedById, supportModeSessionId }, select: { id: true, status: true },
    });
    try {
      await this.queue.add('import', { workbook: workbook.toString('base64') }, { jobId: job.id });
    } catch {
      await this.prisma.bulkImportJob.updateMany({
        where: { id: job.id, status: BulkImportStatus.QUEUED },
        data: { status: BulkImportStatus.FAILED, failureReason: 'The upload could not be queued. Select the file and try again.', finishedAt: new Date() },
      });
    }
    return job;
  }

  async getStatus(companyId: string, submittedById: string, id: string) {
    const job = await this.prisma.bulkImportJob.findFirst({
      where: { id, companyId, submittedById },
      select: { id: true, status: true, totalRows: true, importedCount: true, errors: true, failureReason: true },
    });
    if (!job) throw new NotFoundException('Import job not found.');
    const errors = job.errors as RowError[];
    return {
      ...job,
      errors: [...errors].sort((a, b) => a.row - b.row),
      failedCount: new Set(errors.map(({ row }) => row)).size,
    };
  }

  @Cron('*/15 * * * * *')
  async reconcile() {
    if (!this.queue || this.reconciling) return;
    this.reconciling = true;
    try {
      await this.prisma.bulkImportJob.deleteMany({ where: { finishedAt: { lt: new Date(Date.now() - 86_400_000) } } });
      const pending = await this.prisma.bulkImportJob.findMany({
        where: { status: { in: pendingStatuses }, createdAt: { lt: new Date(Date.now() - 30_000) } },
        select: { id: true, status: true }, orderBy: { createdAt: 'asc' }, take: 100,
      });
      for (const entry of pending) {
        const job = await this.queue.getJob(entry.id);
        if (job) {
          await this.recordTerminalFailure(job);
        } else if (entry.status === BulkImportStatus.PROCESSING) {
          await this.queue.add('import', {}, { jobId: entry.id });
        } else {
          await this.fail(entry.id, 'The queued upload is unavailable. Select the file and try again.');
        }
      }
    } catch {
      this.logger.warn('Could not reconcile bulk imports.');
    } finally {
      this.reconciling = false;
    }
  }

  private async process(queueJob: Job<ImportPayload>) {
    const id = queueJob.id;
    if (!id) return;
    const job = await this.prisma.bulkImportJob.findUnique({
      where: { id },
      include: {
        company: { select: { status: true } },
        submittedBy: { select: {
          id: true, companyId: true, role: true, deletedAt: true,
          employee: { select: { status: true, deletedAt: true } },
        } },
        supportModeSession: { select: { superAdminId: true, companyId: true, endedAt: true, expiresAt: true } },
      },
    });
    if (!job || !pendingStatuses.includes(job.status)) {
      if (queueJob.data.workbook) await queueJob.updateData({});
      return;
    }

    const { submittedBy, supportModeSession } = job;
    const allowed = supportModeSession
      ? submittedBy.role === UserRole.SUPER_ADMIN && submittedBy.companyId === null &&
        supportModeSession.superAdminId === submittedBy.id && supportModeSession.companyId === job.companyId &&
        !supportModeSession.endedAt && supportModeSession.expiresAt > new Date()
      : submittedBy.companyId === job.companyId &&
        (submittedBy.role === UserRole.COMPANY_ADMIN || submittedBy.role === UserRole.HR_MANAGER);
    if (!allowed || isInactiveAccount({ ...submittedBy, company: job.company })) {
      await this.fail(id, 'The submitting account no longer has permission to import employees.');
      if (queueJob.data.workbook) await queueJob.updateData({});
      return;
    }

    if (job.status === BulkImportStatus.QUEUED) {
      if (!queueJob.data.workbook) {
        await this.fail(id, 'The queued upload is unavailable. Select the file and try again.');
        return;
      }
      try {
        const { totalRows, validRows, errors } = await this.imports.prepareImport(job.companyId, Buffer.from(queueJob.data.workbook, 'base64'));
        await this.prisma.bulkImportJob.updateMany({
          where: { id, status: BulkImportStatus.QUEUED },
          data: { status: BulkImportStatus.PROCESSING, totalRows, errors, preparedRows: validRows },
        });
      } catch (error) {
        if (!(error instanceof BadRequestException)) throw error;
        await this.fail(id, error.message);
        await queueJob.updateData({});
        return;
      }
    }

    if (queueJob.data.workbook) await queueJob.updateData({});
    const progress = job.status === BulkImportStatus.PROCESSING
      ? job
      : await this.prisma.bulkImportJob.findUnique({ where: { id } });
    if (!progress || progress.status !== BulkImportStatus.PROCESSING) return;
    const companyId = progress.companyId;
    const rows = progress.preparedRows as PreparedImportRow[];
    const errors = progress.errors as RowError[];
    for (let cursor = progress.cursor; cursor < rows.length; cursor++) {
      const row = rows[cursor];
      const where = { id, status: BulkImportStatus.PROCESSING, cursor };
      try {
        await this.prisma.$transaction(async (tx) => {
          const claimed = await tx.bulkImportJob.updateMany({
            where, data: { cursor: { increment: 1 }, importedCount: { increment: 1 } },
          });
          if (!claimed.count) throw new Error('Import progress changed.');
          await this.imports.importEmployee(tx, companyId, row.employee);
        }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) ||
            !['P2000', 'P2002', 'P2003', 'P2020'].includes(error.code)) throw error;
        const duplicateCode = error.code === 'P2002' && Array.isArray(error.meta?.target) && error.meta.target.includes('employeeCode');
        errors.push(duplicateCode
          ? { row: row.rowNumber, field: 'employeeCode', message: `Employee code ${row.employee.employeeCode} already exists` }
          : { row: row.rowNumber, field: 'general', message: 'Could not import this row. Check the employee details and try again.' });
        const advanced = await this.prisma.bulkImportJob.updateMany({
          where, data: { cursor: { increment: 1 }, errors },
        });
        if (!advanced.count) throw new Error('Import progress changed.');
      }
    }
    await this.prisma.bulkImportJob.updateMany({
      where: { id, status: BulkImportStatus.PROCESSING, cursor: rows.length },
      data: { status: BulkImportStatus.COMPLETED, preparedRows: Prisma.DbNull, finishedAt: new Date() },
    });
  }

  private async recordTerminalFailure(job: Job<ImportPayload>) {
    if (job.id && await job.getState() === 'failed') {
      await this.fail(job.id, JOB_FAILURE);
      if (job.data.workbook) await job.updateData({});
    }
  }

  private async fail(id: string, reason: string) {
    await this.prisma.bulkImportJob.updateMany({
      where: { id, status: { in: pendingStatuses } },
      data: { status: BulkImportStatus.FAILED, preparedRows: Prisma.DbNull, failureReason: reason, finishedAt: new Date() },
    });
  }
}
