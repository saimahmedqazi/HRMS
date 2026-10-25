import { DataScopeService, ROLE_SCOPE_MAP, ROLE_MODULE_MAP } from './data-scope.service';
import { UserRole, DataScope } from '@prisma/client';
import { AuthenticatedUser } from '../decorators/current-user.decorator';

describe('DataScopeService', () => {
  let service: DataScopeService;

  beforeEach(() => {
    service = new DataScopeService();
  });

  describe('ROLE_SCOPE_MAP', () => {
    it('should map roles to correct scopes', () => {
      expect(ROLE_SCOPE_MAP[UserRole.SUPER_ADMIN]).toBe(DataScope.PLATFORM);
      expect(ROLE_SCOPE_MAP[UserRole.OPERATION_MANAGER]).toBe(DataScope.PLATFORM);
      expect(ROLE_SCOPE_MAP[UserRole.COMPANY_ADMIN]).toBe(DataScope.COMPANY);
      expect(ROLE_SCOPE_MAP[UserRole.HR_MANAGER]).toBe(DataScope.COMPANY);
      expect(ROLE_SCOPE_MAP[UserRole.DEPARTMENT_MANAGER]).toBe(DataScope.DEPARTMENT);
      expect(ROLE_SCOPE_MAP[UserRole.TEAM_LEAD]).toBe(DataScope.TEAM);
      expect(ROLE_SCOPE_MAP[UserRole.EMPLOYEE]).toBe(DataScope.SELF);
    });
  });

  describe('applyScope', () => {
    it('should return empty filter for PLATFORM scope (Super Admin)', () => {
      const user: AuthenticatedUser = {
        id: 'user-1',
        email: 'super@zenhr.com',
        role: UserRole.SUPER_ADMIN,
        companyId: null,
      };

      const filter = service.applyScope(user);
      expect(filter).toEqual({});
    });

    it('should return companyId filter for COMPANY scope (Company Admin)', () => {
      const user: AuthenticatedUser = {
        id: 'user-2',
        email: 'admin@acme.com',
        role: UserRole.COMPANY_ADMIN,
        companyId: 'company-123',
      };

      const filter = service.applyScope(user);
      expect(filter).toEqual({ companyId: 'company-123' });
    });

    it('should return departmentId filter for DEPARTMENT scope (Dept Manager)', () => {
      const user: AuthenticatedUser = {
        id: 'user-3',
        email: 'dept@acme.com',
        role: UserRole.DEPARTMENT_MANAGER,
        companyId: 'company-123',
      };

      const filter = service.applyScope(user, { departmentId: 'dept-eng' });
      expect(filter).toEqual({ companyId: 'company-123', departmentId: 'dept-eng' });
    });

    it('should return teamId filter for TEAM scope (Team Lead)', () => {
      const user: AuthenticatedUser = {
        id: 'user-4',
        email: 'lead@acme.com',
        role: UserRole.TEAM_LEAD,
        companyId: 'company-123',
      };

      const filter = service.applyScope(user, { teamId: 'team-backend' });
      expect(filter).toEqual({ companyId: 'company-123', teamId: 'team-backend' });
    });

    it('should return id filter for SELF scope (Employee)', () => {
      const user: AuthenticatedUser = {
        id: 'user-5',
        email: 'emp@acme.com',
        role: UserRole.EMPLOYEE,
        companyId: 'company-123',
      };

      const filter = service.applyScope(user, { employeeId: 'emp-99' });
      expect(filter).toEqual({ companyId: 'company-123', id: 'emp-99' });
    });
  });

  describe('getAllowedModules', () => {
    it('should return company-management and support-mode for SUPER_ADMIN', () => {
      const modules = service.getAllowedModules(UserRole.SUPER_ADMIN);
      expect(modules).toContain('companies');
      expect(modules).toContain('support-mode');
      expect(modules).not.toContain('my-attendance');
    });

    it('should return self-service modules for EMPLOYEE', () => {
      const modules = service.getAllowedModules(UserRole.EMPLOYEE);
      expect(modules).toContain('my-attendance');
      expect(modules).toContain('my-leave');
      expect(modules).toContain('my-payslips');
      expect(modules).not.toContain('companies');
      expect(modules).not.toContain('billing');
    });
  });
});
