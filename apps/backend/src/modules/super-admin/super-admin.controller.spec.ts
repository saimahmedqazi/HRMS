import { SuperAdminController } from './super-admin.controller';
import { SuperAdminService } from './super-admin.service';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';

describe('SuperAdminController', () => {
  let controller: SuperAdminController;
  let mockSuperAdminService: jest.Mocked<Partial<SuperAdminService>>;
  let mockConfigService: jest.Mocked<Partial<ConfigService>>;

  const mockAdmin: AuthenticatedUser = {
    id: 'admin-1',
    email: 'superadmin@zenhr.test',
    role: UserRole.SUPER_ADMIN,
    companyId: null,
  };

  beforeEach(() => {
    mockSuperAdminService = {
      listCompanies: jest.fn(),
      getCompanyDetails: jest.fn(),
      updateCompanyStatus: jest.fn(),
      enterSupportMode: jest.fn(),
      exitSupportMode: jest.fn(),
      resetOperationManagerPassword: jest.fn(),
    };

    mockConfigService = {
      get: jest.fn().mockReturnValue('development'),
    };

    controller = new SuperAdminController(
      mockSuperAdminService as SuperAdminService,
      mockConfigService as ConfigService,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('listCompanies', () => {
    it('should return list of all companies', async () => {
      const mockList = [{ id: 'comp-1', name: 'Acme Corp' }] as any;
      (mockSuperAdminService.listCompanies as jest.Mock).mockResolvedValue(mockList);

      const result = await controller.listCompanies();
      expect(result).toEqual(mockList);
      expect(mockSuperAdminService.listCompanies).toHaveBeenCalled();
    });
  });

  describe('enterSupportMode', () => {
    it('should activate support mode and set httpOnly cookie', async () => {
      const mockResult = {
        accessToken: 'support-token-123',
        session: { id: 'sess-1', companyId: 'comp-1' },
      } as any;
      (mockSuperAdminService.enterSupportMode as jest.Mock).mockResolvedValue(mockResult);

      const res: any = {
        cookie: jest.fn(),
      };

      const dto = { reason: 'Investigating payroll calculation discrepancy ticket #99' };
      const result = await controller.enterSupportMode('comp-1', dto, mockAdmin, res);

      expect(result.message).toBe('Support mode activated for 1 hour');
      expect(mockSuperAdminService.enterSupportMode).toHaveBeenCalledWith(
        'comp-1',
        dto.reason,
        mockAdmin,
      );
      expect(res.cookie).toHaveBeenCalledWith(
        'access_token',
        'support-token-123',
        expect.objectContaining({ httpOnly: true, maxAge: 3600000 }),
      );
    });
  });

  describe('resetOperationManagerPassword', () => {
    it('delegates the one-time reset and records request network metadata', async () => {
      const result = {
        email: 'ops@zenhr.com',
        temporaryPassword: 'one-time-temporary-secret',
        message: 'shown once',
      };
      (mockSuperAdminService.resetOperationManagerPassword as jest.Mock).mockResolvedValue(result);
      const req: any = { ip: '203.0.113.9', get: jest.fn().mockReturnValue('Test Browser') };

      await expect(controller.resetOperationManagerPassword(mockAdmin, req)).resolves.toEqual(result);
      expect(mockSuperAdminService.resetOperationManagerPassword).toHaveBeenCalledWith(
        mockAdmin,
        '203.0.113.9',
        'Test Browser',
      );
      expect(Reflect.getMetadata(
        ROLES_KEY,
        SuperAdminController.prototype.resetOperationManagerPassword,
      )).toEqual([UserRole.SUPER_ADMIN]);
    });
  });
});
