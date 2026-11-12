CREATE TYPE "CompanySuspensionReason" AS ENUM ('NON_PAYMENT', 'MANUAL');

ALTER TABLE "companies" ADD COLUMN "suspensionReason" "CompanySuspensionReason";

CREATE TABLE "stripe_webhook_receipts" (
    "id" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stripe_webhook_receipts_pkey" PRIMARY KEY ("id")
);

-- Restore automatically only when the latest status-change record confirms a billing lockout.
WITH latest_company_status AS (
    SELECT DISTINCT ON ("entityId") "entityId", "newValues"
    FROM "audit_logs"
    WHERE "action" = 'STATUS_CHANGE' AND "entity" = 'Company' AND "entityId" IS NOT NULL
    ORDER BY "entityId", "createdAt" DESC, "id" DESC
)
UPDATE "companies" AS company
SET "suspensionReason" = CASE
    WHEN latest."newValues"->>'reason' = 'Suspended (Non-Payment)' AND EXISTS (
        SELECT 1 FROM "subscriptions" AS subscription
        WHERE subscription."companyId" = company."id" AND subscription."suspendedAt" IS NOT NULL
    ) THEN 'NON_PAYMENT'::"CompanySuspensionReason"
    WHEN latest."newValues"->>'newStatus' = 'SUSPENDED' THEN 'MANUAL'::"CompanySuspensionReason"
END
FROM latest_company_status AS latest
WHERE company."id" = latest."entityId" AND company."status" = 'SUSPENDED';
