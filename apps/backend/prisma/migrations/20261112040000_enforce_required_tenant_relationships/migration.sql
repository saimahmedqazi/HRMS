-- Validate existing relationships atomically before replacing their single-ID keys.
BEGIN;

-- DropForeignKey
ALTER TABLE "attendance_records" DROP CONSTRAINT "attendance_records_employeeId_fkey";

-- DropForeignKey
ALTER TABLE "employee_documents" DROP CONSTRAINT "employee_documents_employeeId_fkey";

-- DropForeignKey
ALTER TABLE "employees" DROP CONSTRAINT "employees_userId_fkey";

-- DropForeignKey
ALTER TABLE "leave_balances" DROP CONSTRAINT "leave_balances_employeeId_fkey";

-- DropForeignKey
ALTER TABLE "leave_requests" DROP CONSTRAINT "leave_requests_employeeId_fkey";

-- DropForeignKey
ALTER TABLE "leave_requests" DROP CONSTRAINT "leave_requests_leaveTypeSettingId_fkey";

-- DropForeignKey
ALTER TABLE "payslips" DROP CONSTRAINT "payslips_employeeId_fkey";

-- DropForeignKey
ALTER TABLE "remote_work_permissions" DROP CONSTRAINT "remote_work_permissions_employeeId_fkey";

-- DropForeignKey
ALTER TABLE "resource_requests" DROP CONSTRAINT "resource_requests_requestedById_fkey";

-- DropForeignKey
ALTER TABLE "teams" DROP CONSTRAINT "teams_departmentId_fkey";

-- DropForeignKey
ALTER TABLE "work_timer_entries" DROP CONSTRAINT "work_timer_entries_employeeId_fkey";

-- CreateIndex
CREATE UNIQUE INDEX "departments_companyId_id_key" ON "departments"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "employees_companyId_id_key" ON "employees"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "employees_companyId_userId_key" ON "employees"("companyId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "leave_type_settings_companyId_id_key" ON "leave_type_settings"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "users_companyId_id_key" ON "users"("companyId", "id");

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_companyId_departmentId_fkey" FOREIGN KEY ("companyId", "departmentId") REFERENCES "departments"("companyId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_companyId_userId_fkey" FOREIGN KEY ("companyId", "userId") REFERENCES "users"("companyId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_companyId_employeeId_fkey" FOREIGN KEY ("companyId", "employeeId") REFERENCES "employees"("companyId", "id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_companyId_employeeId_fkey" FOREIGN KEY ("companyId", "employeeId") REFERENCES "employees"("companyId", "id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "work_timer_entries" ADD CONSTRAINT "work_timer_entries_companyId_employeeId_fkey" FOREIGN KEY ("companyId", "employeeId") REFERENCES "employees"("companyId", "id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "remote_work_permissions" ADD CONSTRAINT "remote_work_permissions_companyId_employeeId_fkey" FOREIGN KEY ("companyId", "employeeId") REFERENCES "employees"("companyId", "id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_companyId_employeeId_fkey" FOREIGN KEY ("companyId", "employeeId") REFERENCES "employees"("companyId", "id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_companyId_leaveTypeSettingId_fkey" FOREIGN KEY ("companyId", "leaveTypeSettingId") REFERENCES "leave_type_settings"("companyId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_companyId_employeeId_fkey" FOREIGN KEY ("companyId", "employeeId") REFERENCES "employees"("companyId", "id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "resource_requests" ADD CONSTRAINT "resource_requests_companyId_requestedById_fkey" FOREIGN KEY ("companyId", "requestedById") REFERENCES "employees"("companyId", "id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_companyId_employeeId_fkey" FOREIGN KEY ("companyId", "employeeId") REFERENCES "employees"("companyId", "id") ON DELETE CASCADE ON UPDATE RESTRICT;

COMMIT;
