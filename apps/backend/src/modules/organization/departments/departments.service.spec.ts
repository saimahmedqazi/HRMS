import { DataScopeService } from '../../../common/services/data-scope.service';
import { Test, TestingModule } from '@nestjs/testing';
import { DepartmentsService } from './departments.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

describe('DepartmentsService', () => {
  let service: DepartmentsService;

  const mockPrisma: any = {
    department: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    employee: {
      findFirst: jest.fn(),
    },
  };

  const mockUser: AuthenticatedUser = {
    id: 'user-admin',
    email: 'admin@acme.com',
    role: UserRole.COMPANY_ADMIN,
    companyId: 'comp-1',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataScopeService,
        DepartmentsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<DepartmentsService>(DepartmentsService);
    jest.clearAllMocks();
  });

  describe('listDepartments', () => {
    it('should return list of departments for the company', async () => {
      mockPrisma.department.findMany.mockResolvedValueOnce([
        { id: 'dept-1', name: 'Engineering', _count: { employees: 12, teams: 3 } },
      ]);

      const result = await service.listDepartments(mockUser);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Engineering');
      expect(mockPrisma.department.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ companyId: 'comp-1' }) }),
      );
    });
  });

  describe('createDepartment', () => {
    it('should throw ConflictException if department name already exists', async () => {
      mockPrisma.department.findFirst.mockResolvedValueOnce({ id: 'existing-dept' });

      await expect(
        service.createDepartment({ name: 'Engineering' }, mockUser),
      ).rejects.toThrow(ConflictException);
    });

    it('should create department successfully', async () => {
      mockPrisma.department.findFirst.mockResolvedValueOnce(null);
      mockPrisma.department.create.mockResolvedValueOnce({
        id: 'new-dept',
        name: 'Product Design',
        companyId: 'comp-1',
      });

      const result = await service.createDepartment({ name: 'Product Design' }, mockUser);
      expect(result.id).toBe('new-dept');
      expect(result.name).toBe('Product Design');
    });
  });

  describe('deleteDepartment', () => {
    it('should throw BadRequestException if department still has active employees', async () => {
      mockPrisma.department.findFirst.mockResolvedValueOnce({
        id: 'dept-1',
        _count: { employees: 4, teams: 1 },
      });

      await expect(service.deleteDepartment('dept-1', mockUser)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if department still has active teams', async () => {
      mockPrisma.department.findFirst.mockResolvedValueOnce({
        id: 'dept-1',
        _count: { employees: 0, teams: 2 },
      });

      await expect(service.deleteDepartment('dept-1', mockUser)).rejects.toThrow(BadRequestException);
    });

    it('should soft delete department when no active employees are assigned', async () => {
      mockPrisma.department.findFirst.mockResolvedValueOnce({
        id: 'dept-empty',
        name: 'Legacy Dept',
        _count: { employees: 0, teams: 0 },
      });
      mockPrisma.department.update.mockResolvedValueOnce({ id: 'dept-empty', deletedAt: new Date() });

      const result = await service.deleteDepartment('dept-empty', mockUser);
      expect(result.id).toBe('dept-empty');
      expect(mockPrisma.department.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'dept-empty' },
          data: expect.objectContaining({
            deletedAt: expect.any(Date),
            name: expect.stringContaining('Legacy Dept_deleted_'),
          }),
        }),
      );
    });
  });

  describe('getDepartmentById (DEF-03 visibility)', () => {
    it('omits employee employment status for regular EMPLOYEE viewers', async () => {
      const employeeUser: AuthenticatedUser = {
        id: 'user-emp',
        email: 'emp@acme.com',
        role: UserRole.EMPLOYEE,
        companyId: 'comp-1',
      };
      mockPrisma.department.findFirst.mockResolvedValueOnce({
        id: 'dept-1',
        name: 'Engineering',
        teams: [],
        employees: [
          {
            id: 'emp-1',
            employeeCode: 'EMP-001',
            firstName: 'Saim',
            lastName: 'Ahmed',
            status: 'ON_PROBATION',
            profilePictureUrl: null,
            designation: { id: 'des-1', name: 'Engineer' },
          },
        ],
        _count: { employees: 1, teams: 0 },
      });

      const res = await service.getDepartmentById('dept-1', employeeUser);
      expect(mockPrisma.department.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            employees: expect.objectContaining({
              select: expect.not.objectContaining({ status: true }),
            }),
          }),
        }),
      );
      expect(res.employees[0]).not.toHaveProperty('status');
      expect(res.employees[0]).toMatchObject({ id: 'emp-1', employeeCode: 'EMP-001', firstName: 'Saim' });
    });

    it('includes employee employment status for HR_MANAGER / COMPANY_ADMIN viewers', async () => {
      mockPrisma.department.findFirst.mockResolvedValueOnce({
        id: 'dept-1',
        name: 'Engineering',
        teams: [],
        employees: [
          {
            id: 'emp-1',
            employeeCode: 'EMP-001',
            firstName: 'Saim',
            lastName: 'Ahmed',
            status: 'ACTIVE',
            profilePictureUrl: null,
            designation: { id: 'des-1', name: 'Engineer' },
          },
        ],
        _count: { employees: 1, teams: 0 },
      });

      const res = await service.getDepartmentById('dept-1', mockUser);
      expect(res.employees[0]).toHaveProperty('status', 'ACTIVE');
    });
  });
});
