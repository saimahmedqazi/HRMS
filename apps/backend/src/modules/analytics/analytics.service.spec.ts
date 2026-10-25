import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceStatus, SubscriptionTier, UserRole } from '@prisma/client';
import { PrismaService } from '@common/prisma/prisma.service';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let prisma: any;

  const mockCompanyId = 'company-123';
  const mockUserId = 'user-emp-1';

  beforeEach(async () => {
    prisma = {
      company: {
        count: jest.fn().mockResolvedValue(10),
      },
      user: {
        count: jest.fn().mockResolvedValue(150),
      },
      employee: {
        count: jest.fn().mockResolvedValue(120),
        findFirst: jest.fn().mockResolvedValue({ id: 'emp-1', userId: mockUserId }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      subscription: {
        count: jest.fn().mockResolvedValue(5),
      },
      attendanceRecord: {
        findFirst: jest.fn().mockResolvedValue({
          status: AttendanceStatus.PRESENT,
          checkInTime: new Date(),
        }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(2),
      },
      workTimerEntry: {
        findFirst: jest.fn().mockResolvedValue({
          status: 'RUNNING',
          totalMinutes: 120,
        }),
      },
      leaveBalance: {
        findMany: jest.fn().mockResolvedValue([
          { leaveType: 'CASUAL', allocated: 10, used: 2, pending: 0, carried: 0 },
        ]),
      },
      payslip: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'ps-1',
          month: 10,
          year: 2026,
          netSalary: 55000,
        }),
      },
      leaveRequest: {
        count: jest.fn().mockResolvedValue(4),
      },
      department: {
        findMany: jest.fn().mockResolvedValue([
          { name: 'Engineering', _count: { employees: 25 } },
          { name: 'Marketing', _count: { employees: 10 } },
        ]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  describe('getSuperAdminMetrics', () => {
    it('should aggregate platform totals, active subscriptions, and estimated MRR', async () => {
      const metrics = await service.getSuperAdminMetrics();

      expect(metrics.totalCompanies).toBe(10);
      expect(metrics.totalEmployees).toBe(120);
      expect(metrics.subscriptions.estimatedMRR).toBeGreaterThan(0);
    });
  });

  describe('getDashboardOverview', () => {
    it('should return personal operational widgets for EMPLOYEE role', async () => {
      const overview = (await service.getDashboardOverview(mockCompanyId, {
        id: mockUserId,
        role: UserRole.EMPLOYEE,
      })) as any;

      expect(overview.role).toBe(UserRole.EMPLOYEE);
      expect(overview.todayAttendance.status).toBe(AttendanceStatus.PRESENT);
      expect(overview.todayTimer.status).toBe('RUNNING');
      expect(overview.leaveBalances.length).toBe(1);
    });

    it('should return executive workforce metrics and department distribution for COMPANY_ADMIN', async () => {
      const overview = (await service.getDashboardOverview(mockCompanyId, {
        id: 'admin-1',
        role: UserRole.COMPANY_ADMIN,
      })) as any;

      expect(overview.role).toBe(UserRole.COMPANY_ADMIN);
      expect(overview.totalEmployees).toBe(120);
      expect(overview.departmentDistribution.length).toBe(2);
      expect(overview.attendanceTrend.length).toBe(7);
    });
  });
});
