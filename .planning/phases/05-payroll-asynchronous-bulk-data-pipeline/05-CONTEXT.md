# Phase 5 Context: Payroll & Asynchronous Bulk Data Pipeline

**Phase:** 05 — Payroll & Asynchronous Bulk Data Pipeline  
**Created:** 2026-10-26  
**Status:** In Progress  

## Key Architectural Decisions

1. **Salary Structure & Calculations**:
   - `PayrollStructure`:
     - `baseSalary`: Decimal
     - `components`: Array of `{ name: string, type: 'ALLOWANCE' | 'DEDUCTION', value: number, isPercentage: boolean }`
     - `taxRules`: `{ brackets: [{ min: number, max: number | null, rate: number }] }`
   - Employee specific base salary override supported (`employee.baseSalary`).
   - Calculation formula:
     - `grossSalary = baseSalary + allowances + bonuses`
     - `taxableIncome = max(0, grossSalary - preTaxDeductions)`
     - `taxAmount = calculateTax(taxableIncome, taxRules)`
     - `netSalary = max(0, grossSalary - deductions - taxAmount)`
2. **Monthly Payroll Run Execution**:
   - `POST /api/v1/payroll/runs`:
     - Parameters: `month: number` (1-12), `year: number`
     - Gated to `HR_MANAGER` and `COMPANY_ADMIN`.
     - Transactionally iterates all active employees in the company.
     - Calculates payslip figures and creates or updates `Payslip` with status `GENERATED`.
     - Emits `NotificationType.PAYSLIP_GENERATED` for every employee.
3. **PDF Payslip Generation & Bulk Archive**:
   - `GET /api/v1/payroll/payslips/:id/pdf`: Streaming PDF download via `pdfkit`.
   - `GET /api/v1/payroll/runs/pdf-bulk`: Streams or zips payslips for the entire company or department for a given month/year.
4. **Department Payroll Access Rules**:
   - `GET /api/v1/payroll/department-summary`:
     - Allowed for `DEPARTMENT_MANAGER` (scoped to their department), `HR_MANAGER`, and `COMPANY_ADMIN`.
     - Strictly forbidden for `TEAM_LEAD` and `EMPLOYEE` (`ForbiddenException('Access denied. Team Leads and Employees cannot view department payroll summaries.')`).
     - Returns aggregate numbers: `totalEmployees`, `totalGross`, `totalDeductions`, `totalNet`, `averageNet`. Never leaks individual employee salary rows to Department Managers unless it is their own payslip!
5. **Asynchronous Bulk Employee Excel Import Pipeline**:
   - `POST /api/v1/employees/bulk/preview`:
     - Uploads `.xlsx` or `.csv`.
     - Parses sheet using `xlsx`.
     - Validates mandatory fields: `firstName`, `lastName`, `email`, `employeeCode`, `hireDate`, `departmentName`, `designationName`.
     - Returns validation summary: `{ validRowsCount, invalidRowsCount, errors: [{ rowNumber, field, message }] }`.
   - `POST /api/v1/employees/bulk/execute`:
     - Processes valid rows transactionally or enqueues into BullMQ background job.
     - Creates User + Employee + Default Shift + LeaveBalances.
     - Returns final report with count of imported records.
