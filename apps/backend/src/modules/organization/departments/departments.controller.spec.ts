import { DepartmentsController } from './departments.controller';
import { DepartmentsService } from './departments.service';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';

describe('DepartmentsController', () => {
  let controller: DepartmentsController;
  let mockDepartmentsService: jest.Mocked<Partial<DepartmentsService>>;

  const mockUser: AuthenticatedUser = {
    id: 'user-1',
    email: 'admin@zenhr.test',
    companyId: 'company-1',
    role: UserRole.COMPANY_ADMIN,
  };

  beforeEach(() => {
    mockDepartmentsService = {
      listDepartments: jest.fn(),
      getDepartmentById: jest.fn(),
      createDepartment: jest.fn(),
      updateDepartment: jest.fn(),
      deleteDepartment: jest.fn(),
    };

    controller = new DepartmentsController(mockDepartmentsService as DepartmentsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('listDepartments', () => {
    it('should list all departments for tenant', async () => {
      const mockList = [{ id: 'dept-1', name: 'Engineering' }] as any;
      (mockDepartmentsService.listDepartments as jest.Mock).mockResolvedValue(mockList);

      const result = await controller.listDepartments(mockUser);
      expect(result).toEqual(mockList);
      expect(mockDepartmentsService.listDepartments).toHaveBeenCalledWith(mockUser);
    });
  });

  describe('createDepartment', () => {
    it('should create a department in tenant', async () => {
      const mockCreated = { id: 'dept-1', name: 'Product' } as any;
      (mockDepartmentsService.createDepartment as jest.Mock).mockResolvedValue(mockCreated);

      const dto = { name: 'Product', description: 'Product design and roadmapping' };
      const result = await controller.createDepartment(dto, mockUser);
      expect(result).toEqual(mockCreated);
      expect(mockDepartmentsService.createDepartment).toHaveBeenCalledWith(dto, mockUser);
    });
  });
});
