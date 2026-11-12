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
        findUnique: jest.fn().mockResolvedValue({ timezone: 'UTC' }),
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
      employeeShift: { findFirst: jest.fn().mockResolvedValue(null) },
      shift: { findFirst: jest.fn().mockResolvedValue(null) },
      attendanceRecord: {
        findFirst: jest.fn().mockResolvedValue({
          status: AttendanceStatus.PRESENT,
          date: new Date(),
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
    it('counts Team Lead attendance on the company date across a UTC day boundary', async () => {
      jest.useFakeTimers({ now: new Date('2026-11-11T20:00:00Z') });
      try {
        prisma.company.findUnique.mockResolvedValue({ timezone: 'Asia/Karachi' });
        prisma.employee.findFirst.mockResolvedValue({ id: 'lead', teamId: 'team-1' });
        prisma.employee.findMany.mockResolvedValue([{ id: 'lead' }, { id: 'member' }, { id: 'remote' }]);
        prisma.attendanceRecord.findMany.mockResolvedValue([
          { status: AttendanceStatus.PRESENT },
          { status: AttendanceStatus.PRESENT_REMOTE },
          { status: AttendanceStatus.ABSENT_PENDING_REVIEW },
        ]);

        const overview = await service.getDashboardOverview(mockCompanyId, {
          id: 'lead-user',
          role: UserRole.TEAM_LEAD,
        });
        expect(overview).toMatchObject({
          attendanceDate: '2026-11-12',
          presentToday: 2,
          todaySummary: { present: 1, remote: 1, absent: 0, exceptions: 1 },
        });
        expect(prisma.attendanceRecord.findMany).toHaveBeenCalledWith({
          where: {
            companyId: mockCompanyId,
            employeeId: { in: ['lead', 'member', 'remote'] },
            date: new Date('2026-11-12T00:00:00Z'),
          },
        });
      } finally {
        jest.useRealTimers();
      }
    });

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
