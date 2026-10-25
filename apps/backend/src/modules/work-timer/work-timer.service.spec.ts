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
    company: {
      findUnique: jest.fn(),
    },
    employee: {
      findFirst: jest.fn(),
    },
    workTimerEntry: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    timerBreak: {
      create: jest.fn(),
      update: jest.fn(),
    },
    attendanceRecord: {
      upsert: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
    },
    notification: {
      create: jest.fn(),
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
  });

  describe('resumeTimer & break overstay alert', () => {
    it('should broadcast break alert and send emails when accumulated breaks exceed limit', async () => {
      mockPrisma.company.findUnique.mockResolvedValueOnce({
        subscriptionTier: SubscriptionTier.PREMIUM,
      });
      mockPrisma.employee.findFirst.mockResolvedValueOnce({
        id: 'emp-1',
        firstName: 'John',
        lastName: 'Doe',
        employeeCode: 'EMP-001',
        department: { id: 'd-1', name: 'Engineering', managerId: 'mgr-1' },
        team: { id: 't-1', name: 'Frontend', leadId: 'lead-1' },
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
      ]);
      mockPrisma.notification.create.mockResolvedValueOnce({});
      mockPrisma.workTimerEntry.update.mockResolvedValueOnce({
        id: 'timer-1',
        status: TimerStatus.RUNNING,
      });

      const result = await service.resumeTimer(mockUser);
      expect(result.status).toBe(TimerStatus.RUNNING);
      expect(mockGateway.broadcastBreakAlert).toHaveBeenCalledWith(
        'comp-premium',
        'lead-1',
        'mgr-1',
        expect.objectContaining({
          employeeName: 'John Doe',
          shiftBreakLimit: 60,
        }),
      );
      expect(mockMailService.sendMail).toHaveBeenCalled();
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
        breaks: [{ id: 'b-1', durationMin: 60, endedAt: new Date() }], // 60m break -> 540m active
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
            workMinutes: expect.any(Number),
            overtimeMinutes: expect.any(Number),
          }),
        }),
      );
    });
  });
});
