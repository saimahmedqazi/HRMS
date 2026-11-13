import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import * as xlsx from 'xlsx';
import { PrismaService } from '@common/prisma/prisma.service';
import { BulkImportService } from './bulk-import.service';
import { PASSWORD_SETUP_REQUIRED } from '@common/utils/password-policy';

describe('BulkImportService', () => {
  let service: BulkImportService;
  let prisma: any;

  const mockCompanyId = 'company-123';

  beforeEach(async () => {
    prisma = {
      $queryRaw: jest.fn(),
      user: {
        findMany: jest.fn().mockResolvedValue([{ email: 'existing@zenhr.com' }]),
        create: jest.fn().mockResolvedValue({ id: 'user-new' }),
      },
      employee: {
        findMany: jest.fn().mockResolvedValue([{ employeeCode: 'EMP-001' }]),
        create: jest.fn().mockResolvedValue({ id: 'emp-new' }),
      },
      department: {
        findUnique: jest.fn().mockResolvedValue({ id: 'dept-eng' }),
        create: jest.fn().mockResolvedValue({ id: 'dept-new' }),
      },
      designation: {
        findUnique: jest.fn().mockResolvedValue({ id: 'desig-eng' }),
        create: jest.fn().mockResolvedValue({ id: 'desig-new' }),
      },
      shift: { findFirst: jest.fn().mockResolvedValue({ id: 'shift-default' }) },
      employeeShift: { create: jest.fn().mockResolvedValue({}) },
      leaveTypeSetting: { findMany: jest.fn().mockResolvedValue([{ leaveType: 'SICK', annualAllocation: 3 }]) },
      leaveBalance: {
        createMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BulkImportService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<BulkImportService>(BulkImportService);
  });

  function createMockExcelBuffer(rows: any[]): Buffer {
    const ws = xlsx.utils.json_to_sheet(rows);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Employees');
    return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }

  describe('previewImport', () => {
    it('should throw BadRequestException if file is missing', async () => {
      await expect(service.previewImport(mockCompanyId, null as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should validate valid rows and flag duplicate/missing fields with exact row numbers', async () => {
      const rows = [
        {
          firstName: 'Alice',
          lastName: 'Smith',
          email: 'alice@zenhr.com',
          employeeCode: 'EMP-101',
          hireDate: '2026-01-15',
          departmentName: 'Engineering',
          designationName: 'Software Engineer',
          baseSalary: 60000,
        },
        {
          // Missing first name, already existing email
          firstName: '',
          lastName: 'Doe',
          email: 'existing@zenhr.com',
          employeeCode: 'EMP-102',
          hireDate: '2026-02-01',
        },
        {
          // Duplicate email within sheet
          firstName: 'Charlie',
          lastName: 'Brown',
          email: 'alice@zenhr.com',
          employeeCode: 'EMP-103',
          hireDate: 'invalid-date',
        },
      ];

      const buffer = createMockExcelBuffer(rows);
      const mockFile: any = { buffer, originalname: 'employees.xlsx' };

      const result = await service.previewImport(mockCompanyId, mockFile);

      expect(prisma.user.findMany).toHaveBeenCalledWith({ where: { companyId: mockCompanyId }, select: { email: true } });
      expect(result.totalRows).toBe(3);
      expect(result.validCount).toBe(1);
      expect(result.invalidCount).toBe(2);
      expect(result.errors.length).toBeGreaterThan(0);

      // Check specific error rows
      expect(result.errors.some((e) => e.row === 3 && e.field === 'firstName')).toBe(true);
      expect(result.errors.some((e) => e.row === 3 && e.field === 'email')).toBe(true);
      expect(result.errors.some((e) => e.row === 4 && e.field === 'hireDate')).toBe(true);
    });
  });

  describe('prepared import rows', () => {
    it('rejects calendar rollover in CSV and preserves the date of a valid row', async () => {
      const buffer = Buffer.from([
        'firstName,lastName,email,employeeCode,hireDate',
        'Fixture,Invalid,invalid@example.test,EMP-101,2026-02-30',
        'Fixture,Valid,valid@example.test,EMP-102,2026-02-28',
      ].join('\n'));
      const result = await service.prepareImport(mockCompanyId, buffer);
      expect(result.errors).toMatchObject([{ row: 2, field: 'hireDate' }]);
      expect(result.validRows[0].employee.hireDate).toBe('2026-02-28T00:00:00.000Z');
    });

    it.each([false, true])('keeps the calendar day of Excel serial dates with date1904=%s', async (date1904) => {
      const workbook = xlsx.utils.book_new();
      workbook.Workbook = { WBProps: { date1904 } };
      const sheet = xlsx.utils.json_to_sheet([{
        firstName: 'Fixture', lastName: 'Excel', email: 'excel@example.test',
        employeeCode: 'EMP-101', hireDate: 46036 - (date1904 ? 1462 : 0),
      }]);
      sheet.E2.z = 'yyyy-mm-dd';
      xlsx.utils.book_append_sheet(workbook, sheet, 'Employees');
      const result = await service.prepareImport(mockCompanyId, xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
      expect(result.errors).toEqual([]);
      expect(result.validRows[0].employee.hireDate).toBe('2026-01-14T00:00:00.000Z');
    });
    it('reports an invalid salary and preserves a zero salary in valid rows', async () => {
      const common = { firstName: 'Alice', lastName: 'Smith', hireDate: '2026-01-15' };
      const buffer = createMockExcelBuffer([
        { ...common, email: 'zero@example.test', employeeCode: 'EMP-101', baseSalary: 0 },
        { ...common, email: 'invalid@example.test', employeeCode: 'EMP-102', baseSalary: 'invalid' },
      ]);

      const result = await service.prepareImport(mockCompanyId, buffer);

      expect(result.validRows).toHaveLength(1);
      expect(result.errors).toMatchObject([{ row: 3, field: 'baseSalary' }]);
      await service.importEmployee(prisma, mockCompanyId, result.validRows[0].employee);
      expect(prisma.employee.create).toHaveBeenCalledWith({ data: expect.objectContaining({ baseSalary: 0 }) });
    });

    it('prepares a report when validation finds no valid rows', async () => {
      const buffer = createMockExcelBuffer([{
        firstName: '', lastName: 'Smith', email: 'alice@zenhr.com', employeeCode: 'EMP-101', hireDate: '2026-01-15',
      }]);

      await expect(service.prepareImport(mockCompanyId, buffer)).resolves.toEqual({
        totalRows: 1, validRows: [],
        errors: [{ row: 2, field: 'firstName', message: 'First name is required' }],
      });
    });

    it('writes the employee and leave balances using the supplied transaction', async () => {
      const rows = [
        {
          firstName: 'Alice',
          lastName: 'Smith',
          email: 'alice@zenhr.com',
          employeeCode: 'EMP-101',
          hireDate: '2026-01-15',
          departmentName: 'Engineering',
          designationName: 'Software Engineer',
          baseSalary: 60000,
        },
      ];

      const buffer = createMockExcelBuffer(rows);
      const result = await service.prepareImport(mockCompanyId, buffer);
      await service.importEmployee(prisma, mockCompanyId, result.validRows[0].employee);
      expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ passwordHash: PASSWORD_SETUP_REQUIRED }),
      }));
      expect(prisma.employee.create).toHaveBeenCalled();
      expect(prisma.leaveTypeSetting.findMany).toHaveBeenCalledWith({
        where: { companyId: mockCompanyId, isActive: true },
        select: { leaveType: true, annualAllocation: true },
      });
      expect(prisma.leaveBalance.createMany).toHaveBeenCalledWith({ data: [{
        companyId: mockCompanyId, employeeId: 'emp-new', leaveType: 'SICK', year: new Date().getFullYear(), allocated: 3,
      }] });
      expect(prisma.employeeShift.create).toHaveBeenCalledWith({ data: {
        companyId: mockCompanyId, employeeId: 'emp-new', shiftId: 'shift-default', effectiveFrom: expect.any(Date),
      } });
    });

    it('leaves unconfigured shifts and allowances for the company to set', async () => {
      prisma.shift.findFirst.mockResolvedValueOnce(null);
      prisma.leaveTypeSetting.findMany.mockResolvedValueOnce([]);
      await service.importEmployee(prisma, mockCompanyId, {
        firstName: 'Fixture', lastName: 'Import', email: 'fixture@example.test', employeeCode: 'EMP-101', hireDate: '2025-01-15',
      });
      expect(prisma.employeeShift.create).not.toHaveBeenCalled();
      expect(prisma.leaveBalance.createMany).not.toHaveBeenCalled();
    });
  });
});
