import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { ListEmployeesQueryDto } from './dto/list-employees-query.dto';
import { UserRole, EmployeeStatus } from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

describe('EmployeesController', () => {
  let controller: EmployeesController;
  let mockEmployeesService: jest.Mocked<Partial<EmployeesService>>;

  const mockUser: AuthenticatedUser = {
    id: 'user-1',
    email: 'hr@zenhr.test',
    companyId: 'company-1',
    role: UserRole.HR_MANAGER,
  };

  beforeEach(() => {
    mockEmployeesService = {
      listEmployees: jest.fn(),
      getEmployeeById: jest.fn(),
      onboardEmployee: jest.fn(),
      updateEmployee: jest.fn(),
      updateStatus: jest.fn(),
      uploadDocument: jest.fn(),
    };

    controller = new EmployeesController(mockEmployeesService as EmployeesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('listEmployees', () => {
    it('should list employees with query filters', async () => {
      const mockResult = { data: [{ id: 'emp-1', firstName: 'John' }], total: 1 } as any;
      (mockEmployeesService.listEmployees as jest.Mock).mockResolvedValue(mockResult);

      const query: ListEmployeesQueryDto = {
        search: 'John',
        status: EmployeeStatus.ACTIVE,
        page: 1,
        limit: 10,
      };
      const result = await controller.listEmployees(mockUser, query);
      expect(result).toEqual(mockResult);
      expect(mockEmployeesService.listEmployees).toHaveBeenCalledWith(mockUser, query);
    });

    it('validates ListEmployeesQueryDto: accepts ON_PROBATION and rejects invalid status or bounds', async () => {
      const pipe = new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      });

      const valid = await pipe.transform(
        { status: 'ON_PROBATION', page: '1', limit: '12', sortBy: 'firstName', sortOrder: 'asc' },
        { type: 'query', metatype: ListEmployeesQueryDto },
      );
      expect(valid).toMatchObject({
        status: EmployeeStatus.ON_PROBATION,
        page: 1,
        limit: 12,
        sortBy: 'firstName',
        sortOrder: 'asc',
      });

      await expect(
        pipe.transform({ status: 'INVALID_STATUS' }, { type: 'query', metatype: ListEmployeesQueryDto }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        pipe.transform({ page: '0' }, { type: 'query', metatype: ListEmployeesQueryDto }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        pipe.transform({ limit: '500' }, { type: 'query', metatype: ListEmployeesQueryDto }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getEmployeeById', () => {
    it('should return employee profile by id', async () => {
      const mockResult = { id: 'emp-1', firstName: 'John' } as any;
      (mockEmployeesService.getEmployeeById as jest.Mock).mockResolvedValue(mockResult);

      const result = await controller.getEmployeeById('emp-1', mockUser);
      expect(result).toEqual(mockResult);
      expect(mockEmployeesService.getEmployeeById).toHaveBeenCalledWith('emp-1', mockUser);
    });
  });

  describe('updateStatus', () => {
    it('should update employee lifecycle status', async () => {
      const mockResult = { id: 'emp-1', status: EmployeeStatus.ON_LEAVE } as any;
      (mockEmployeesService.updateStatus as jest.Mock).mockResolvedValue(mockResult);

      const dto = { status: EmployeeStatus.ON_LEAVE, reason: 'Approved medical leave' };
      const result = await controller.updateStatus('emp-1', dto, mockUser);
      expect(result).toEqual(mockResult);
      expect(mockEmployeesService.updateStatus).toHaveBeenCalledWith('emp-1', dto, mockUser);
    });
  });
});
