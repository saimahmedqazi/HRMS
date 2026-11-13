import 'multer';
import {
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import * as xlsx from 'xlsx';
import { DataScope, EmployeeStatus, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '@common/prisma/prisma.service';
import { lockEmployeeOnboarding } from '@common/prisma/employee-onboarding-lock';
import { initializeEmployeePolicies } from '@common/prisma/initialize-employee-policies';
import { PASSWORD_SETUP_REQUIRED } from '@common/utils/password-policy';
import { getProbationEndDate, parseEmployeeDate } from '@common/utils/employee-dates';

export type RowError = {
  row: number;
  field: string;
  message: string;
};

export type EmployeeImportRow = {
  firstName: string;
  lastName: string;
  email: string;
  employeeCode: string;
  hireDate: string;
  departmentName?: string;
  designationName?: string;
  baseSalary?: number;
  phone?: string;
};

type WorksheetRow = Record<string, unknown> & { __rowNum__: number };
export type PreparedImportRow = { rowNumber: number; employee: EmployeeImportRow };

@Injectable()
export class BulkImportService {
  constructor(private readonly prisma: PrismaService) {}

  createTemplate(): Buffer {
    const workbook = xlsx.utils.book_new();
    const sheet = xlsx.utils.aoa_to_sheet([[
      'firstName', 'lastName', 'email', 'employeeCode', 'hireDate',
      'departmentName', 'designationName', 'baseSalary', 'phone',
    ]]);
    xlsx.utils.book_append_sheet(workbook, sheet, 'Employees');
    return xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }

  /**
   * Parse workbook from buffer.
   */
  private parseWorkbook(buffer: Buffer): { rows: WorksheetRow[]; date1904: boolean } {
    try {
      const workbook = xlsx.read(buffer, { type: 'buffer', raw: true });
      const sheetName = workbook.SheetNames[0];
      return {
        rows: sheetName ? xlsx.utils.sheet_to_json<WorksheetRow>(workbook.Sheets[sheetName]) : [],
        date1904: workbook.Workbook?.WBProps?.date1904 === true,
      };
    } catch {
      throw new BadRequestException('Failed to parse the Excel or CSV file.');
    }
  }

  /**
   * Validate and preview Excel data without saving to DB.
   */
  async previewImport(companyId: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Please provide an Excel or CSV file.');
    const { totalRows, validRows, errors } = await this.prepareImport(companyId, file.buffer);
    return {
      totalRows,
      validCount: validRows.length,
      invalidCount: totalRows - validRows.length,
      errors,
      sampleValid: validRows.slice(0, 5).map(({ employee }) => employee),
    };
  }

  async prepareImport(companyId: string, workbook: Buffer) {
    const { rows: rawRows, date1904 } = this.parseWorkbook(workbook);
    if (rawRows.length === 0) {
      throw new BadRequestException('Uploaded spreadsheet contains no data rows.');
    }

    const errors: RowError[] = [];
    const validRows: PreparedImportRow[] = [];
    const seenEmails = new Set<string>();
    const seenCodes = new Set<string>();

    // Preview may disclose conflicts only within the HR user's own company.
    const existingUsers = await this.prisma.user.findMany({
      where: { companyId },
      select: { email: true },
    });
    const existingEmails = new Set(existingUsers.map((u) => u.email.toLowerCase()));

    const existingEmployees = await this.prisma.employee.findMany({
      where: { companyId },
      select: { employeeCode: true },
    });
    const existingCodes = new Set(existingEmployees.map((e) => e.employeeCode.toUpperCase()));

    for (const row of rawRows) {
      const rowNum = row.__rowNum__ + 1;
      let hasError = false;

      const firstName = (row.firstName || row.FirstName || row['First Name'] || '').toString().trim();
      const lastName = (row.lastName || row.LastName || row['Last Name'] || '').toString().trim();
      const email = (row.email || row.Email || '').toString().trim().toLowerCase();
      const employeeCode = (row.employeeCode || row.EmployeeCode || row['Employee Code'] || '').toString().trim().toUpperCase();

      if (!firstName) {
        errors.push({ row: rowNum, field: 'firstName', message: 'First name is required' });
        hasError = true;
      }

      if (!lastName) {
        errors.push({ row: rowNum, field: 'lastName', message: 'Last name is required' });
        hasError = true;
      }

      if (!email || !email.includes('@')) {
        errors.push({ row: rowNum, field: 'email', message: 'Valid email address is required' });
        hasError = true;
      } else if (existingEmails.has(email)) {
        errors.push({ row: rowNum, field: 'email', message: `Email ${email} is already registered in company` });
        hasError = true;
      } else if (seenEmails.has(email)) {
        errors.push({ row: rowNum, field: 'email', message: `Duplicate email ${email} within upload sheet` });
        hasError = true;
      }

      if (!employeeCode) {
        errors.push({ row: rowNum, field: 'employeeCode', message: 'Employee code is required' });
        hasError = true;
      } else if (existingCodes.has(employeeCode)) {
        errors.push({ row: rowNum, field: 'employeeCode', message: `Employee code ${employeeCode} already exists` });
        hasError = true;
      } else if (seenCodes.has(employeeCode)) {
        errors.push({ row: rowNum, field: 'employeeCode', message: `Duplicate employee code ${employeeCode} within sheet` });
        hasError = true;
      }

      const rawHireDate = row.hireDate ?? row.HireDate ?? row['Hire Date'];
      let hireDate: Date | undefined;
      if (typeof rawHireDate === 'number') {
        const parts: { y: number; m: number; d: number } | null = xlsx.SSF.parse_date_code(rawHireDate, { date1904 });
        if (parts) {
          const year = String(parts.y).padStart(4, '0');
          const month = String(parts.m).padStart(2, '0');
          const day = String(parts.d).padStart(2, '0');
          hireDate = parseEmployeeDate(`${year}-${month}-${day}`);
        }
      } else if (typeof rawHireDate === 'string') {
        hireDate = parseEmployeeDate(rawHireDate.trim());
      }

      if (!hireDate) {
        errors.push({ row: rowNum, field: 'hireDate', message: 'Valid hire date (YYYY-MM-DD) is required' });
        hasError = true;
      }

      const rawSalary = row.baseSalary;
      const salaryProvided = rawSalary != null && String(rawSalary).trim() !== '';
      const baseSalary = salaryProvided ? Number(rawSalary) : undefined;
      if (baseSalary !== undefined && (
        (typeof rawSalary !== 'string' && typeof rawSalary !== 'number') ||
        !Number.isFinite(baseSalary) || baseSalary < 0 || baseSalary > 9_999_999_999.99
      )) {
        errors.push({ row: rowNum, field: 'baseSalary', message: 'Base salary must be a number between 0 and 9999999999.99' });
        hasError = true;
      }

      if (!hasError && hireDate) {
        seenEmails.add(email);
        seenCodes.add(employeeCode);
        validRows.push({
          rowNumber: rowNum,
          employee: {
            firstName,
            lastName,
            email,
            employeeCode,
            hireDate: hireDate.toISOString(),
            departmentName: (row.departmentName || row.Department || '').toString().trim() || undefined,
            designationName: (row.designationName || row.Designation || '').toString().trim() || undefined,
            baseSalary,
            phone: (row.phone || row.Phone || '').toString().trim() || undefined,
          },
        });
      }
    }

    return { totalRows: rawRows.length, validRows, errors };
  }

  async importEmployee(tx: Prisma.TransactionClient, companyId: string, employee: EmployeeImportRow) {
    await lockEmployeeOnboarding(tx, companyId);
    const {
      firstName, lastName, email, employeeCode, baseSalary, phone,
      departmentName: deptName, designationName: desigName,
    } = employee;
    const hireDate = new Date(employee.hireDate);

    // Resolve Department
    let departmentId: string | null = null;
    if (deptName) {
      let dept = await tx.department.findUnique({
        where: { companyId_name: { companyId, name: deptName } },
      });
      if (!dept) {
        dept = await tx.department.create({
          data: { companyId, name: deptName },
        });
      }
      departmentId = dept.id;
    }

    // Resolve Designation
    let designationId: string | null = null;
    if (desigName) {
      let desig = await tx.designation.findUnique({
        where: { companyId_name: { companyId, name: desigName } },
      });
      if (!desig) {
        desig = await tx.designation.create({
          data: { companyId, name: desigName },
        });
      }
      designationId = desig.id;
    }

    // Create User
    const user = await tx.user.create({
      data: {
        companyId,
        email,
        passwordHash: PASSWORD_SETUP_REQUIRED,
        role: UserRole.EMPLOYEE,
        dataScope: DataScope.SELF,
        isEmailVerified: true,
      },
    });

    // Create Employee
    const probationEnd = getProbationEndDate(hireDate);

    const emp = await tx.employee.create({
      data: {
        companyId,
        userId: user.id,
        employeeCode,
        firstName,
        lastName,
        phone,
        hireDate,
        probationEndDate: probationEnd,
        status: EmployeeStatus.ON_PROBATION,
        departmentId,
        designationId,
        baseSalary,
      },
    });

    await initializeEmployeePolicies(tx, companyId, emp.id);
  }
}
