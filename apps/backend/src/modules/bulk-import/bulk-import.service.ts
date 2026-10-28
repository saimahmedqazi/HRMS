import 'multer';
import {
  Injectable,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import * as xlsx from 'xlsx';
import * as bcrypt from 'bcrypt';
import { DataScope, EmployeeStatus, LeaveType, UserRole } from '@prisma/client';
import { PrismaService } from '@common/prisma/prisma.service';

export interface RowError {
  row: number;
  field: string;
  message: string;
}

export interface EmployeeImportRow {
  firstName: string;
  lastName: string;
  email: string;
  employeeCode: string;
  hireDate: string;
  departmentName?: string;
  designationName?: string;
  baseSalary?: number;
  phone?: string;
}

@Injectable()
export class BulkImportService {
  private readonly logger = new Logger(BulkImportService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Parse workbook from buffer.
   */
  parseWorkbook(buffer: Buffer): any[] {
    try {
      const workbook = xlsx.read(buffer, { type: 'buffer', cellDates: true });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) return [];
      const sheet = workbook.Sheets[sheetName];
      return xlsx.utils.sheet_to_json(sheet);
    } catch (err: any) {
      throw new BadRequestException('Failed to parse Excel file: ' + err.message);
    }
  }

  /**
   * Validate and preview Excel data without saving to DB.
   */
  async previewImport(companyId: string, file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Please provide an Excel or CSV file.');
    }

    const rawRows = this.parseWorkbook(file.buffer);
    if (rawRows.length === 0) {
      throw new BadRequestException('Uploaded spreadsheet contains no data rows.');
    }

    const errors: RowError[] = [];
    const validRows: EmployeeImportRow[] = [];
    const seenEmails = new Set<string>();
    const seenCodes = new Set<string>();

    // Fetch existing users and codes for duplicate checking
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

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      const rowNum = i + 2; // Row 1 is header
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

      if (!hasError) {
        seenEmails.add(email);
        seenCodes.add(employeeCode);
        validRows.push({
          firstName,
          lastName,
          email,
          employeeCode,
          hireDate: hireDateStr,
          departmentName: (row.departmentName || row.Department || '').toString().trim() || undefined,
          designationName: (row.designationName || row.Designation || '').toString().trim() || undefined,
          baseSalary: row.baseSalary ? Number(row.baseSalary) : undefined,
          phone: (row.phone || row.Phone || '').toString().trim() || undefined,
        });
      }
    }

    return {
      totalRows: rawRows.length,
      validCount: validRows.length,
      invalidCount: rawRows.length - validRows.length,
      errors,
      sampleValid: validRows.slice(0, 5),
    };
  }

  /**
   * Execute permanent bulk import of valid rows.
   */
  async executeImport(companyId: string, file: Express.Multer.File) {
    const preview = await this.previewImport(companyId, file);
    if (preview.validCount === 0) {
      throw new BadRequestException('No valid rows found in file to import.');
    }

    const defaultPasswordHash = await bcrypt.hash('ZenHR@Default2026!', 10);
    const rawRows = this.parseWorkbook(file.buffer);

    let importedCount = 0;
    const errors: RowError[] = [...preview.errors];

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      const rowNum = i + 2;

      // Skip row if it had validation errors
      if (preview.errors.some((e) => e.row === rowNum)) continue;

      const firstName = (row.firstName || row.FirstName || row['First Name'] || '').toString().trim();
      const lastName = (row.lastName || row.LastName || row['Last Name'] || '').toString().trim();
      const email = (row.email || row.Email || '').toString().trim().toLowerCase();
      const employeeCode = (row.employeeCode || row.EmployeeCode || row['Employee Code'] || '').toString().trim().toUpperCase();
      let hireDate = new Date();
      const rawHireDate = row.hireDate ?? row.HireDate ?? row['Hire Date'];
      if (rawHireDate instanceof Date && !isNaN(rawHireDate.getTime())) {
        hireDate = rawHireDate;
      } else if (typeof rawHireDate === 'number') {
        hireDate = new Date(Math.round((rawHireDate - 25569) * 86400 * 1000));
      } else if (typeof rawHireDate === 'string' && rawHireDate.trim() && !isNaN(Date.parse(rawHireDate))) {
        hireDate = new Date(rawHireDate);
      }
      const deptName = (row.departmentName || row.Department || '').toString().trim();
      const desigName = (row.designationName || row.Designation || '').toString().trim();
      const baseSalary = row.baseSalary ? Number(row.baseSalary) : undefined;
      const phone = (row.phone || row.Phone || '').toString().trim() || undefined;

      try {
        await this.prisma.$transaction(async (tx) => {
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
              passwordHash: defaultPasswordHash,
              role: UserRole.EMPLOYEE,
              dataScope: DataScope.SELF,
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
        });

        importedCount++;
      } catch (err: any) {
        this.logger.error(`Import failed on row ${rowNum}: ${err.message}`);
        errors.push({ row: rowNum, field: 'general', message: err.message });
      }
    }

    return {
      totalRows: rawRows.length,
      importedCount,
      failedCount: rawRows.length - importedCount,
      errors,
    };
  }
}
