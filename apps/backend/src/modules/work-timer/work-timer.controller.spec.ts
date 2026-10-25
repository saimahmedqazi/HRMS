import { WorkTimerController } from './work-timer.controller';
import { WorkTimerService } from './work-timer.service';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

describe('WorkTimerController', () => {
  let controller: WorkTimerController;
  let mockWorkTimerService: jest.Mocked<Partial<WorkTimerService>>;

  const mockUser: AuthenticatedUser = {
    id: 'user-1',
    email: 'user@zenhr.test',
    companyId: 'company-1',
    role: UserRole.EMPLOYEE,
  };

  beforeEach(() => {
    mockWorkTimerService = {
      startTimer: jest.fn(),
      pauseTimer: jest.fn(),
      resumeTimer: jest.fn(),
      stopTimer: jest.fn(),
      getTodayTimer: jest.fn(),
    };

    controller = new WorkTimerController(mockWorkTimerService as WorkTimerService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('startTimer', () => {
    it('should start timer session for user', async () => {
      const mockResult = { id: 'timer-1', isRunning: true } as any;
      (mockWorkTimerService.startTimer as jest.Mock).mockResolvedValue(mockResult);

      const result = await controller.startTimer(mockUser);
      expect(result).toEqual(mockResult);
      expect(mockWorkTimerService.startTimer).toHaveBeenCalledWith(mockUser);
    });
  });

  describe('pauseTimer', () => {
    it('should pause timer and start break', async () => {
      const mockResult = { id: 'timer-1', isPaused: true } as any;
      (mockWorkTimerService.pauseTimer as jest.Mock).mockResolvedValue(mockResult);

      const result = await controller.pauseTimer(mockUser);
      expect(result).toEqual(mockResult);
      expect(mockWorkTimerService.pauseTimer).toHaveBeenCalledWith(mockUser);
    });
  });

  describe('resumeTimer', () => {
    it('should resume timer and close break', async () => {
      const mockResult = { id: 'timer-1', isRunning: true } as any;
      (mockWorkTimerService.resumeTimer as jest.Mock).mockResolvedValue(mockResult);

      const result = await controller.resumeTimer(mockUser);
      expect(result).toEqual(mockResult);
      expect(mockWorkTimerService.resumeTimer).toHaveBeenCalledWith(mockUser);
    });
  });

  describe('stopTimer', () => {
    it('should stop timer and sync overtime math', async () => {
      const mockResult = { id: 'timer-1', stoppedAt: new Date() } as any;
      (mockWorkTimerService.stopTimer as jest.Mock).mockResolvedValue(mockResult);

      const result = await controller.stopTimer(mockUser);
      expect(result).toEqual(mockResult);
      expect(mockWorkTimerService.stopTimer).toHaveBeenCalledWith(mockUser);
    });
  });

  describe('getTodayTimer', () => {
    it('should fetch today timer session', async () => {
      const mockResult = { hasSession: true, session: { id: 'timer-1' } } as any;
      (mockWorkTimerService.getTodayTimer as jest.Mock).mockResolvedValue(mockResult);

      const result = await controller.getTodayTimer(mockUser);
      expect(result).toEqual(mockResult);
      expect(mockWorkTimerService.getTodayTimer).toHaveBeenCalledWith(mockUser);
    });
  });
});
