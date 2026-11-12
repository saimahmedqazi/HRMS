-- PostgreSQL 16 clears only the optional ID on deletion and preserves the required company ID.
BEGIN;

-- DropForeignKey
ALTER TABLE "employee_shifts" DROP CONSTRAINT "employee_shifts_employeeId_fkey";

-- DropForeignKey
ALTER TABLE "employee_shifts" DROP CONSTRAINT "employee_shifts_shiftId_fkey";

-- DropForeignKey
ALTER TABLE "employees" DROP CONSTRAINT "employees_departmentId_fkey";

-- DropForeignKey
ALTER TABLE "employees" DROP CONSTRAINT "employees_designationId_fkey";

-- DropForeignKey
ALTER TABLE "employees" DROP CONSTRAINT "employees_reportingManagerId_fkey";

-- DropForeignKey
ALTER TABLE "employees" DROP CONSTRAINT "employees_teamId_fkey";

-- DropForeignKey
ALTER TABLE "payslips" DROP CONSTRAINT "payslips_payrollStructureId_fkey";

-- AlterTable
ALTER TABLE "employee_shifts" ADD COLUMN "companyId" TEXT;
UPDATE "employee_shifts" AS assignment
SET "companyId" = employee."companyId"
FROM "employees" AS employee
WHERE employee."id" = assignment."employeeId";
ALTER TABLE "employee_shifts" ALTER COLUMN "companyId" SET NOT NULL;

-- Render runs migrations before replacing the API. Older instances omit this column on insert.
CREATE FUNCTION "employee_shifts_fill_company_id"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  SELECT "companyId" INTO NEW."companyId"
  FROM "employees" WHERE "id" = NEW."employeeId";
  RETURN NEW;
END;
$$;

CREATE TRIGGER "employee_shifts_fill_company_id"
BEFORE INSERT ON "employee_shifts"
FOR EACH ROW WHEN (NEW."companyId" IS NULL)
EXECUTE FUNCTION "employee_shifts_fill_company_id"();

-- CreateIndex
CREATE INDEX "departments_managerId_idx" ON "departments"("managerId");

-- CreateIndex
CREATE UNIQUE INDEX "designations_companyId_id_key" ON "designations"("companyId", "id");

-- CreateIndex
CREATE INDEX "employee_shifts_companyId_employeeId_effectiveFrom_idx" ON "employee_shifts"("companyId", "employeeId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "employee_shifts_companyId_shiftId_idx" ON "employee_shifts"("companyId", "shiftId");

-- CreateIndex
CREATE INDEX "employees_designationId_idx" ON "employees"("designationId");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_structures_companyId_id_key" ON "payroll_structures"("companyId", "id");

-- CreateIndex
CREATE INDEX "payslips_payrollStructureId_idx" ON "payslips"("payrollStructureId");

-- CreateIndex
CREATE UNIQUE INDEX "shifts_companyId_id_key" ON "shifts"("companyId", "id");

-- CreateIndex
CREATE INDEX "teams_leadId_idx" ON "teams"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "teams_companyId_id_key" ON "teams"("companyId", "id");

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_companyId_managerId_fkey" FOREIGN KEY ("companyId", "managerId") REFERENCES "employees"("companyId", "id") ON DELETE SET NULL ("managerId") ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_companyId_leadId_fkey" FOREIGN KEY ("companyId", "leadId") REFERENCES "employees"("companyId", "id") ON DELETE SET NULL ("leadId") ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_companyId_departmentId_fkey" FOREIGN KEY ("companyId", "departmentId") REFERENCES "departments"("companyId", "id") ON DELETE SET NULL ("departmentId") ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_companyId_designationId_fkey" FOREIGN KEY ("companyId", "designationId") REFERENCES "designations"("companyId", "id") ON DELETE SET NULL ("designationId") ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_companyId_teamId_fkey" FOREIGN KEY ("companyId", "teamId") REFERENCES "teams"("companyId", "id") ON DELETE SET NULL ("teamId") ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_companyId_reportingManagerId_fkey" FOREIGN KEY ("companyId", "reportingManagerId") REFERENCES "employees"("companyId", "id") ON DELETE SET NULL ("reportingManagerId") ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "employee_shifts" ADD CONSTRAINT "employee_shifts_companyId_employeeId_fkey" FOREIGN KEY ("companyId", "employeeId") REFERENCES "employees"("companyId", "id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "employee_shifts" ADD CONSTRAINT "employee_shifts_companyId_shiftId_fkey" FOREIGN KEY ("companyId", "shiftId") REFERENCES "shifts"("companyId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_companyId_payrollStructureId_fkey" FOREIGN KEY ("companyId", "payrollStructureId") REFERENCES "payroll_structures"("companyId", "id") ON DELETE SET NULL ("payrollStructureId") ON UPDATE RESTRICT;

COMMIT;
