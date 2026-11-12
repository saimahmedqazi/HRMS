import { Test, TestingModule } from '@nestjs/testing';
import { WorkTimerService } from './work-timer.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MailService } from '../../common/mail/mail.service';
import { AttendanceGateway } from '../attendance/attendance.gateway';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { SubscriptionTier, TimerStatus, UserRole } from '@prisma/client';

describe('WorkTimerService', () => {
  let service: WorkTimerService;

  const mockPrisma: any = {
    $transaction: jest.fn((callback) => callback(mockPrisma)),
    company: {
      findUnique: jest.fn(),
    },
    employee: {
      findFirst: jest.fn(),
    },
    employeeShift: { findFirst: jest.fn().mockResolvedValue(null) },
    shift: { findFirst: jest.fn().mockResolvedValue(null) },
    workTimerEntry: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    timerBreak: {
      create: jest.fn(),
      update: jest.fn(),
    },
    attendanceRecord: {
      findFirst: jest.fn().mockResolvedValue(null),
      upsert: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
    },
    notification: {
      createMany: jest.fn(),
    },
  };

  const mockMailService = {
    sendMail: jest.fn().mockResolvedValue(true),
  };

  const mockGateway = {
    broadcastBreakAlert: jest.fn(),
  };

  const mockUser: AuthenticatedUser = {
    id: 'user-1',
    email: 'dev@acme.com',
    role: UserRole.EMPLOYEE,
    companyId: 'comp-premium',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkTimerService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MailService, useValue: mockMailService },
        { provide: AttendanceGateway, useValue: mockGateway },
      ],
    }).compile();

    service = module.get<WorkTimerService>(WorkTimerService);
    jest.clearAllMocks();
  });

  describe('startTimer', () => {
    it('should throw ForbiddenException if company is on BASIC subscription tier', async () => {
      mockPrisma.company.findUnique.mockResolvedValueOnce({
        subscriptionTier: SubscriptionTier.BASIC,
      });

      await expect(service.startTimer(mockUser)).rejects.toThrow(ForbiddenException);
    });

    it('should create running timer entry for PREMIUM tier subscriber', async () => {
      mockPrisma.company.findUnique.mockResolvedValueOnce({
        subscriptionTier: SubscriptionTier.PREMIUM,
      });
      mockPrisma.employee.findFirst.mockResolvedValueOnce({
        id: 'emp-1',
        companyId: 'comp-premium',
      });
      mockPrisma.workTimerEntry.findFirst.mockResolvedValueOnce(null);
      mockPrisma.workTimerEntry.create.mockResolvedValueOnce({
        id: 'timer-1',
        status: TimerStatus.RUNNING,
      });

      const result = await service.startTimer(mockUser);
      expect(result.status).toBe(TimerStatus.RUNNING);
      expect(mockPrisma.workTimerEntry.create).toHaveBeenCalled();
    });

    it('starts a new session on the existing stopped daily timer', async () => {
      mockPrisma.company.findUnique.mockResolvedValueOnce({ subscriptionTier: SubscriptionTier.PREMIUM });
      mockPrisma.employee.findFirst.mockResolvedValueOnce({ id: 'emp-1' });
      mockPrisma.workTimerEntry.findFirst.mockResolvedValueOnce({ id: 'timer-1', status: TimerStatus.STOPPED });

      await service.startTimer(mockUser);

      expect(mockPrisma.workTimerEntry.update).toHaveBeenCalledWith({
        where: { id: 'timer-1', companyId: 'comp-premium', status: TimerStatus.STOPPED },
        data: { status: TimerStatus.RUNNING, activeSessionStartedAt: expect.any(Date), stoppedAt: null },
      });
      expect(mockPrisma.workTimerEntry.create).not.toHaveBeenCalled();
    });
  });

  describe('resumeTimer & break overstay alert', () => {
    it('should broadcast break alert and send emails when accumulated breaks exceed limit', async () => {
      mockPrisma.company.findUnique.mockResolvedValueOnce({
        subscriptionTier: SubscriptionTier.PREMIUM,
      });
      mockPrisma.employee.findFirst.mockResolvedValueOnce({
        id: 'emp-1',
        companyId: 'comp-premium',
        firstName: 'John',
        lastName: 'Doe',
        employeeCode: 'EMP-001',
        department: { companyId: 'comp-premium', name: 'Engineering', managerId: 'mgr-1' },
        team: { companyId: 'comp-premium', leadId: 'lead-1' },
        shifts: [{ shift: { breakDuration: 60 } }], // 60 min allowed
      });
      mockPrisma.workTimerEntry.findFirst.mockResolvedValueOnce({
        id: 'timer-1',
        status: TimerStatus.PAUSED,
        breaks: [
          { id: 'b-1', startedAt: new Date(Date.now() - 75 * 60000), endedAt: null }, // 75m open break (> 60m threshold)
        ],
      });
      mockPrisma.timerBreak.update.mockResolvedValueOnce({});
      mockPrisma.user.findMany.mockResolvedValueOnce([
        { id: 'ceo-1', email: 'ceo@acme.com' },
        { id: 'lead-user', email: 'lead@acme.com' },
      ]);
      mockPrisma.notification.createMany.mockResolvedValueOnce({ count: 2 });
      mockPrisma.workTimerEntry.update.mockResolvedValueOnce({
        id: 'timer-1',
        status: TimerStatus.RUNNING,
      });

      const result = await service.resumeTimer(mockUser);
      expect(result.status).toBe(TimerStatus.RUNNING);
      expect(mockGateway.broadcastBreakAlert).toHaveBeenCalledWith(
        'comp-premium',
        ['ceo-1', 'lead-user'],
      );
      expect(mockPrisma.workTimerEntry.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ id: 'timer-1', companyId: 'comp-premium', breakAlertedAt: null }),
      }));
      expect(mockPrisma.notification.createMany).toHaveBeenCalledWith({ data: [
        expect.objectContaining({ companyId: 'comp-premium', userId: 'ceo-1' }),
        expect.objectContaining({ companyId: 'comp-premium', userId: 'lead-user' }),
      ] });
      expect(mockMailService.sendMail).toHaveBeenCalledTimes(2);
    });
  });

  describe('stopTimer & overtime synchronization', () => {
    it('should calculate active work minutes and sync overtime to attendance record', async () => {
      const startedAt = new Date(Date.now() - 10 * 3600000); // 10h ago = 600m
      mockPrisma.company.findUnique.mockResolvedValueOnce({
        subscriptionTier: SubscriptionTier.PREMIUM,
      });
      mockPrisma.employee.findFirst.mockResolvedValueOnce({
        id: 'emp-1',
        companyId: 'comp-premium',
        shifts: [],
      });
      mockPrisma.workTimerEntry.findFirst.mockResolvedValueOnce({
        id: 'timer-1',
        startedAt,
        status: TimerStatus.RUNNING,
        breaks: [{
          id: 'b-1',
          startedAt: new Date(startedAt.getTime() + 60 * 60000),
          endedAt: new Date(startedAt.getTime() + 120 * 60000),
        }],
      });
      mockPrisma.workTimerEntry.update.mockResolvedValueOnce({
        id: 'timer-1',
        status: TimerStatus.STOPPED,
        totalMinutes: 540,
      });
      mockPrisma.attendanceRecord.upsert.mockResolvedValueOnce({});

      const result = await service.stopTimer(mockUser);
      expect(result.status).toBe(TimerStatus.STOPPED);
      expect(mockPrisma.attendanceRecord.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            workMinutes: 540,
            overtimeMinutes: 60,
          }),
        }),
      );
    });

    it('should deduct open break duration when stopping a PAUSED timer', async () => {
      const now = Date.now();
      const startedAt = new Date(now - 120 * 60000); // 120m ago
      const openBreakStart = new Date(now - 30 * 60000); // paused 30m ago
      mockPrisma.company.findUnique.mockResolvedValueOnce({
        subscriptionTier: SubscriptionTier.PREMIUM,
      });
      mockPrisma.employee.findFirst.mockResolvedValueOnce({
        id: 'emp-1',
        companyId: 'comp-premium',
        shifts: [],
      });
      mockPrisma.workTimerEntry.findFirst.mockResolvedValueOnce({
        id: 'timer-1',
        startedAt,
        status: TimerStatus.PAUSED,
        breaks: [{ id: 'b-open', startedAt: openBreakStart, endedAt: null, durationMin: null }],
      });
      mockPrisma.timerBreak.update.mockResolvedValueOnce({});
      mockPrisma.workTimerEntry.update.mockImplementationOnce((args: any) =>
        Promise.resolve({ id: 'timer-1', ...args.data }),
      );
      mockPrisma.attendanceRecord.upsert.mockResolvedValueOnce({});

      const result = await service.stopTimer(mockUser);
      expect(result.totalMinutes).toBe(90); // 120m elapsed - 30m open break = 90m work
    });

    it('keeps stopped time and earlier breaks out of a restarted session', async () => {
      const now = Date.now();
      mockPrisma.company.findUnique.mockResolvedValueOnce({ subscriptionTier: SubscriptionTier.PREMIUM });
      mockPrisma.employee.findFirst.mockResolvedValueOnce({ id: 'emp-1' });
      mockPrisma.workTimerEntry.findFirst.mockResolvedValueOnce({
        id: 'timer-1',
        status: TimerStatus.RUNNING,
        startedAt: new Date(now - 4 * 3600000),
        activeSessionStartedAt: new Date(now - 10 * 60000),
        totalMinutes: 20,
        workedSeconds: 1217,
        breaks: [
          { startedAt: new Date(now - 160 * 60000), endedAt: new Date(now - 150 * 60000) },
          { startedAt: new Date(now - 6 * 60000), endedAt: new Date(now - 4 * 60000) },
        ],
      });
      mockPrisma.workTimerEntry.update.mockImplementationOnce(({ data }: any) => Promise.resolve(data));

      const result = await service.stopTimer(mockUser);

      expect(result).toMatchObject({ totalMinutes: 28, workedSeconds: 1697, activeSessionStartedAt: null });
      expect(mockPrisma.attendanceRecord.upsert).toHaveBeenCalledWith(expect.objectContaining({
        update: { workMinutes: 28, overtimeMinutes: 0 },
      }));
    });
  });
});
