import { TENANT_MODELS } from './tenant-extension';

describe('TenantExtension', () => {
  describe('TENANT_MODELS registry', () => {
    it('should include core tenant-owned models', () => {
      expect(TENANT_MODELS.has('employee')).toBe(true);
      expect(TENANT_MODELS.has('department')).toBe(true);
      expect(TENANT_MODELS.has('designation')).toBe(true);
      expect(TENANT_MODELS.has('attendanceRecord')).toBe(true);
      expect(TENANT_MODELS.has('workTimerEntry')).toBe(true);
      expect(TENANT_MODELS.has('leaveRequest')).toBe(true);
      expect(TENANT_MODELS.has('payslip')).toBe(true);
    });

    it('should NOT include platform-level models', () => {
      expect(TENANT_MODELS.has('company')).toBe(false);
      expect(TENANT_MODELS.has('user')).toBe(false);
      expect(TENANT_MODELS.has('auditLog')).toBe(false);
      expect(TENANT_MODELS.has('supportModeSession')).toBe(false);
    });
  });
});
