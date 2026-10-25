import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserRole, ApprovalStatus } from '@prisma/client';
import { ApprovalEngineService, RequesterContext } from './approval-engine.service';

describe('ApprovalEngineService', () => {
  let service: ApprovalEngineService;

  beforeEach(() => {
    service = new ApprovalEngineService();
  });

  describe('assertCanRequestLeave (Probation Gating)', () => {
    it('should throw ForbiddenException if employee is on probation and within 90 days of hire', () => {
      const recentHire = new Date();
      recentHire.setDate(recentHire.getDate() - 30); // 30 days ago

      expect(() =>
        service.assertCanRequestLeave({
          status: 'ON_PROBATION',
          hireDate: recentHire,
          role: UserRole.EMPLOYEE,
        }),
      ).toThrow(ForbiddenException);
    });

    it('should allow employee on probation if 90 days have elapsed', () => {
      const pastHire = new Date();
      pastHire.setDate(pastHire.getDate() - 95); // 95 days ago

      expect(() =>
        service.assertCanRequestLeave({
          status: 'ON_PROBATION',
          hireDate: pastHire,
          role: UserRole.EMPLOYEE,
        }),
      ).not.toThrow();
    });

    it('should allow regular ACTIVE employee without throwing', () => {
      const recentHire = new Date();
      recentHire.setDate(recentHire.getDate() - 10);

      expect(() =>
        service.assertCanRequestLeave({
          status: 'ACTIVE',
          hireDate: recentHire,
          role: UserRole.EMPLOYEE,
        }),
      ).not.toThrow();
    });

    it('should allow non-EMPLOYEE roles even if on probation', () => {
      const recentHire = new Date();
      recentHire.setDate(recentHire.getDate() - 20);

      expect(() =>
        service.assertCanRequestLeave({
          status: 'ON_PROBATION',
          hireDate: recentHire,
          role: UserRole.DEPARTMENT_MANAGER,
        }),
      ).not.toThrow();
    });

    it('should throw ForbiddenException if employee is SUSPENDED or TERMINATED', () => {
      expect(() =>
        service.assertCanRequestLeave({
          status: 'SUSPENDED',
          hireDate: new Date('2020-01-01'),
          role: UserRole.EMPLOYEE,
        }),
      ).toThrow(ForbiddenException);
    });
  });

  describe('resolveApprovers (Dynamic Reporting-Line Resolution)', () => {
    it('should route Employee request to Team Lead (Step 1) and HR Manager (Step 2)', () => {
      const requester: RequesterContext = {
        id: 'emp-1',
        userId: 'user-emp-1',
        status: 'ACTIVE',
        hireDate: new Date('2025-01-01'),
        role: UserRole.EMPLOYEE,
        leadUserId: 'user-lead',
        deptManagerUserId: 'user-mgr',
      };

      const result = service.resolveApprovers(requester, 'user-hr', 'user-ceo');

      expect(result.step1ApproverId).toBe('user-lead');
      expect(result.step1Status).toBe(ApprovalStatus.PENDING);
      expect(result.step2ApproverId).toBe('user-hr');
      expect(result.step2Status).toBe(ApprovalStatus.PENDING);
    });

    it('should route Team Lead request to Dept Manager (Step 1) and HR Manager (Step 2)', () => {
      const requester: RequesterContext = {
        id: 'emp-lead',
        userId: 'user-lead',
        status: 'ACTIVE',
        hireDate: new Date('2025-01-01'),
        role: UserRole.TEAM_LEAD,
        deptManagerUserId: 'user-mgr',
      };

      const result = service.resolveApprovers(requester, 'user-hr', 'user-ceo');

      expect(result.step1ApproverId).toBe('user-mgr');
      expect(result.step1Status).toBe(ApprovalStatus.PENDING);
      expect(result.step2ApproverId).toBe('user-hr');
      expect(result.step2Status).toBe(ApprovalStatus.PENDING);
    });

    it('should route Department Manager request to CEO (Step 1) and skip Step 2', () => {
      const requester: RequesterContext = {
        id: 'emp-mgr',
        userId: 'user-mgr',
        status: 'ACTIVE',
        hireDate: new Date('2025-01-01'),
        role: UserRole.DEPARTMENT_MANAGER,
      };

      const result = service.resolveApprovers(requester, 'user-hr', 'user-ceo');

      expect(result.step1ApproverId).toBe('user-ceo');
      expect(result.step1Status).toBe(ApprovalStatus.PENDING);
      expect(result.step2ApproverId).toBeNull();
      expect(result.step2Status).toBe(ApprovalStatus.SKIPPED);
    });

    it('should auto-skip Step 1 if the requester is their own step 1 approver', () => {
      const requester: RequesterContext = {
        id: 'emp-lead',
        userId: 'user-lead',
        status: 'ACTIVE',
        hireDate: new Date('2025-01-01'),
        role: UserRole.EMPLOYEE,
        leadUserId: 'user-lead',
      };

      const result = service.resolveApprovers(requester, 'user-hr', 'user-ceo');

      expect(result.step1ApproverId).toBe('user-lead');
      expect(result.step1Status).toBe(ApprovalStatus.SKIPPED);
      expect(result.step2ApproverId).toBe('user-hr');
      expect(result.step2Status).toBe(ApprovalStatus.PENDING);
    });
  });

  describe('calculateTotalDays', () => {
    it('should compute inclusive day count accurately', () => {
      expect(service.calculateTotalDays('2026-11-10', '2026-11-10')).toBe(1);
      expect(service.calculateTotalDays('2026-11-10', '2026-11-12')).toBe(3);
    });

    it('should throw BadRequestException if end date is before start date', () => {
      expect(() =>
        service.calculateTotalDays('2026-11-12', '2026-11-10'),
      ).toThrow(BadRequestException);
    });
  });
});
