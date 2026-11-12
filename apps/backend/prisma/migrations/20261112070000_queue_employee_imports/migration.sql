CREATE TYPE "BulkImportStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE "bulk_import_jobs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "supportModeSessionId" TEXT,
    "status" "BulkImportStatus" NOT NULL DEFAULT 'QUEUED',
    "preparedRows" JSONB,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "cursor" INTEGER NOT NULL DEFAULT 0,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB NOT NULL DEFAULT '[]',
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "bulk_import_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bulk_import_jobs_status_createdAt_idx" ON "bulk_import_jobs"("status", "createdAt");
CREATE INDEX "bulk_import_jobs_finishedAt_idx" ON "bulk_import_jobs"("finishedAt");
CREATE INDEX "bulk_import_jobs_companyId_submittedById_idx" ON "bulk_import_jobs"("companyId", "submittedById");

ALTER TABLE "bulk_import_jobs" ADD CONSTRAINT "bulk_import_jobs_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bulk_import_jobs" ADD CONSTRAINT "bulk_import_jobs_submittedById_fkey"
    FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bulk_import_jobs" ADD CONSTRAINT "bulk_import_jobs_supportModeSessionId_fkey"
    FOREIGN KEY ("supportModeSessionId") REFERENCES "support_mode_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
