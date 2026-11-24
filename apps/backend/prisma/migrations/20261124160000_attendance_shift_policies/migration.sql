ALTER TYPE "AttendanceStatus" ADD VALUE 'IN_PROGRESS';
ALTER TYPE "AttendanceStatus" ADD VALUE 'HALF_DAY';
ALTER TYPE "AttendanceStatus" ADD VALUE 'MISSING_CHECKOUT';

ALTER TABLE "attendance_records"
  ADD COLUMN "punchPolicy" JSONB,
  ADD COLUMN "finalizedAt" TIMESTAMP(3),
  ADD COLUMN "remoteReviewPending" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "remoteRejected" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "shift_revisions" (
  "companyId" TEXT NOT NULL,
  "shiftId" TEXT NOT NULL,
  "effectiveDate" DATE NOT NULL,
  "startTime" TEXT NOT NULL,
  "endTime" TEXT NOT NULL,
  "breakDuration" INTEGER NOT NULL,
  "workDays" INTEGER[] NOT NULL,
  "requiredMinutes" INTEGER NOT NULL,
  "halfDayMinutes" INTEGER NOT NULL,
  "fullDayMinutes" INTEGER NOT NULL,
  "overtimeEnabled" BOOLEAN NOT NULL,
  "overtimeCapMinutes" INTEGER,
  PRIMARY KEY ("companyId", "shiftId", "effectiveDate"),
  FOREIGN KEY ("companyId", "shiftId") REFERENCES "shifts" ("companyId", "id") ON DELETE CASCADE ON UPDATE RESTRICT
);
