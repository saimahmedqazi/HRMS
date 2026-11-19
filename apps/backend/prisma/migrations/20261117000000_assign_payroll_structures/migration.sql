ALTER TABLE "employees"
ADD COLUMN "payrollStructureId" TEXT;

CREATE INDEX "employees_payrollStructureId_idx"
ON "employees"("payrollStructureId");

ALTER TABLE "employees"
ADD CONSTRAINT "employees_payrollStructureId_fkey"
FOREIGN KEY ("companyId", "payrollStructureId") REFERENCES "payroll_structures"("companyId", "id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "payroll_structures"
ADD COLUMN "currencyCode" TEXT NOT NULL DEFAULT 'USD';

ALTER TABLE "payslips"
ADD COLUMN "currencyCode" TEXT NOT NULL DEFAULT 'USD';
