import { ResourcesController } from './resources.controller';
import { ResourcesService } from './resources.service';
import { ResourceRequestStatus, UserRole } from '@prisma/client';

describe('ResourcesController', () => {
  let controller: ResourcesController;
  let mockResourcesService: jest.Mocked<Partial<ResourcesService>>;

  const mockUser = {
    id: 'user-1',
    userId: 'user-1',
    companyId: 'company-1',
    role: UserRole.EMPLOYEE,
    departmentId: 'dept-1',
  };

  beforeEach(() => {
    mockResourcesService = {
      createResourceRequest: jest.fn(),
      getResourceRequests: jest.fn(),
      approveResourceRequest: jest.fn(),
      fulfillResourceRequest: jest.fn(),
    };

    controller = new ResourcesController(mockResourcesService as ResourcesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createResourceRequest', () => {
    it('should submit an equipment resource request', async () => {
      const mockResult = { id: 'req-1', item: '4K Monitor', status: ResourceRequestStatus.PENDING } as any;
      (mockResourcesService.createResourceRequest as jest.Mock).mockResolvedValue(mockResult);

      const dto = {
        resourceType: 'Equipment',
        description: '4K Monitor',
        justification: 'Ergonomic dual screen setup',
      };
      const result = await controller.createResourceRequest(mockUser, dto);
      expect(result).toEqual(mockResult);
      expect(mockResourcesService.createResourceRequest).toHaveBeenCalledWith('company-1', 'user-1', dto);
    });
  });

  describe('getResourceRequests', () => {
    it('should return list of requests in scope', async () => {
      const mockList = [{ id: 'req-1', item: '4K Monitor' }] as any;
      (mockResourcesService.getResourceRequests as jest.Mock).mockResolvedValue(mockList);

      const result = await controller.getResourceRequests(mockUser, ResourceRequestStatus.PENDING);
      expect(result).toEqual(mockList);
      expect(mockResourcesService.getResourceRequests).toHaveBeenCalledWith('company-1', mockUser, ResourceRequestStatus.PENDING);
    });
  });
});
