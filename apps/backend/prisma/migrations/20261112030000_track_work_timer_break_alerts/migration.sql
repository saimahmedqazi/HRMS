ALTER TABLE "work_timer_entries" ADD COLUMN "breakAlertedAt" TIMESTAMP(3);

CREATE INDEX "work_timer_entries_status_breakAlertedAt_idx" ON "work_timer_entries"("status", "breakAlertedAt");
