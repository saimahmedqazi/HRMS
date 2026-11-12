ALTER TABLE "work_timer_entries"
ADD COLUMN "activeSessionStartedAt" TIMESTAMP(3),
ADD COLUMN "workedSeconds" INTEGER;
