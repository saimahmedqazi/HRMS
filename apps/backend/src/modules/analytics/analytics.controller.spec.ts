import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { UserRole } from '@prisma/client';

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  let mockAnalyticsService: jest.Mocked<Partial<AnalyticsService>>;

  beforeEach(() => {
    mockAnalyticsService = {
      getDashboardOverview: jest.fn(),
      getSuperAdminMetrics: jest.fn(),
    };

    controller = new AnalyticsController(mockAnalyticsService as AnalyticsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getOverview', () => {
    it('should call getDashboardOverview with companyId and user', async () => {
      const mockUser = {
        userId: 'u1',
        companyId: 'comp-1',
        role: UserRole.HR_MANAGER,
      };
      const mockResult = {
        role: UserRole.HR_MANAGER,
        metrics: { totalEmployees: 50 },
        charts: {},
      } as any;
      (mockAnalyticsService.getDashboardOverview as jest.Mock).mockResolvedValue(mockResult);

      const result = await controller.getOverview(mockUser);
      expect(result).toEqual(mockResult);
      expect(mockAnalyticsService.getDashboardOverview).toHaveBeenCalledWith('comp-1', mockUser);
    });
  });

  describe('getSuperAdminMetrics', () => {
    it('should call getSuperAdminMetrics platform-wide', async () => {
      const mockMetrics = {
        totalTenants: 5,
        totalUsers: 100,
        estimatedMRR: 1500,
      } as any;
      (mockAnalyticsService.getSuperAdminMetrics as jest.Mock).mockResolvedValue(mockMetrics);

      const result = await controller.getSuperAdminMetrics();
      expect(result).toEqual(mockMetrics);
      expect(mockAnalyticsService.getSuperAdminMetrics).toHaveBeenCalled();
    });
  });
});
