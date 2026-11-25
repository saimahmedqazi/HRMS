ALTER TABLE "leave_requests"
  ADD COLUMN "step1ApprovedStart" DATE,
  ADD COLUMN "step1ApprovedEnd" DATE,
  ADD COLUMN "step1PartialReason" TEXT,
  ADD COLUMN "step2PartialReason" TEXT,
  ADD COLUMN "approvedStart" DATE,
  ADD COLUMN "approvedEnd" DATE,
  ADD COLUMN "approvedDays" INTEGER,
  ADD COLUMN "approvedDaysByYear" JSONB;
