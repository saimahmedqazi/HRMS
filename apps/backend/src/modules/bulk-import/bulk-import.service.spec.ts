import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import * as xlsx from 'xlsx';
import { PrismaService } from '@common/prisma/prisma.service';
import { BulkImportService } from './bulk-import.service';

describe('BulkImportService', () => {
  let service: BulkImportService;
  let prisma: any;

  const mockCompanyId = 'company-123';

  beforeEach(async () => {
    prisma = {
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
      leaveBalance: {
        createMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
      $transaction: jest.fn((callback) => callback(prisma)),
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

  describe('executeImport', () => {
    it('should import valid employees transactionally', async () => {
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
      const mockFile: any = { buffer, originalname: 'employees.xlsx' };

      const result = await service.executeImport(mockCompanyId, mockFile);

      expect(result.importedCount).toBe(1);
      expect(prisma.user.create).toHaveBeenCalled();
      expect(prisma.employee.create).toHaveBeenCalled();
      expect(prisma.leaveBalance.createMany).toHaveBeenCalled();
    });
  });
});
