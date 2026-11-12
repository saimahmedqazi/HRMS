import 'multer';
import {
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import * as xlsx from 'xlsx';
import { DataScope, EmployeeStatus, LeaveType, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '@common/prisma/prisma.service';
import { PASSWORD_SETUP_REQUIRED } from '@common/utils/password-policy';

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
  private parseWorkbook(buffer: Buffer): WorksheetRow[] {
    try {
      const workbook = xlsx.read(buffer, { type: 'buffer', cellDates: true });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) return [];
      const sheet = workbook.Sheets[sheetName];
      return xlsx.utils.sheet_to_json<WorksheetRow>(sheet);
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
    const rawRows = this.parseWorkbook(workbook);
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

      let hireDateStr = '';
      const rawHireDate = row.hireDate ?? row.HireDate ?? row['Hire Date'];
      if (rawHireDate instanceof Date && !isNaN(rawHireDate.getTime())) {
        hireDateStr = rawHireDate.toISOString();
      } else if (typeof rawHireDate === 'number') {
        const d = new Date(Math.round((rawHireDate - 25569) * 86400 * 1000));
        if (!isNaN(d.getTime())) hireDateStr = d.toISOString();
      } else if (typeof rawHireDate === 'string' && rawHireDate.trim() && !isNaN(Date.parse(rawHireDate))) {
        hireDateStr = new Date(rawHireDate).toISOString();
      }

      if (!hireDateStr) {
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

      if (!hasError) {
        seenEmails.add(email);
        seenCodes.add(employeeCode);
        validRows.push({
          rowNumber: rowNum,
          employee: {
            firstName,
            lastName,
            email,
            employeeCode,
            hireDate: hireDateStr,
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
    const probationEnd = new Date(hireDate.getTime() + 90 * 24 * 60 * 60 * 1000);

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

    // Seed default leave balances
    const year = hireDate.getFullYear();
    await tx.leaveBalance.createMany({
      data: [
        { companyId, employeeId: emp.id, leaveType: LeaveType.CASUAL, year, allocated: 10 },
        { companyId, employeeId: emp.id, leaveType: LeaveType.SICK, year, allocated: 14 },
        { companyId, employeeId: emp.id, leaveType: LeaveType.ANNUAL, year, allocated: 14 },
      ],
    });
  }
}
