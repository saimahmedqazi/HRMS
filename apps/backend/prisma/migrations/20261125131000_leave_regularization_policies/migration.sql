ALTER TABLE "companies"
  ADD COLUMN "regularizationEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "regularizationLookback" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "regularizationExceptional" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "regularizationDocument" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "leave_type_settings"
  ADD COLUMN "isPaid" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "enforceEntitlement" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "allowDuringProbation" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "maxConsecutiveDays" INTEGER;

ALTER TABLE "leave_requests"
  ADD COLUMN "policySnapshot" JSONB,
  ADD COLUMN "retrospective" BOOLEAN NOT NULL DEFAULT false;

INSERT INTO "leave_type_settings" ("id", "companyId", "leaveType", "isActive", "isPaid", "enforceEntitlement", "updatedAt")
SELECT 'exceptional-' || c.id || '-' || t.kind, c.id, t.kind::"LeaveType", false, t.kind = 'SPECIAL', false, CURRENT_TIMESTAMP
FROM "companies" c CROSS JOIN (VALUES ('SPECIAL'), ('UNPAID')) t(kind)
ON CONFLICT ("companyId", "leaveType") DO NOTHING;
