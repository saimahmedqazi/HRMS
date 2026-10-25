import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { UserRole, AttendanceStatus } from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

describe('AttendanceController', () => {
  let controller: AttendanceController;
  let mockAttendanceService: jest.Mocked<Partial<AttendanceService>>;

  const mockUser: AuthenticatedUser = {
    id: 'user-1',
    email: 'employee@zenhr.test',
    companyId: 'company-1',
    role: UserRole.EMPLOYEE,
  };

  beforeEach(() => {
    mockAttendanceService = {
      checkIn: jest.fn(),
      checkOut: jest.fn(),
      getTodayStatus: jest.fn(),
      listAttendanceRecords: jest.fn(),
      listExceptions: jest.fn(),
      resolveException: jest.fn(),
    };

    controller = new AttendanceController(mockAttendanceService as AttendanceService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('checkIn', () => {
    it('should delegate check-in to attendanceService with detected IP', async () => {
      const mockResult = { id: 'att-1', status: AttendanceStatus.PRESENT } as any;
      (mockAttendanceService.checkIn as jest.Mock).mockResolvedValue(mockResult);

      const req: any = {
        headers: { 'x-forwarded-for': '192.168.1.100, 10.0.0.1' },
        socket: { remoteAddress: '127.0.0.1' },
      };

      const dto = {
        isRemote: false,
        latitude: 40.7128,
        longitude: -74.006,
        notes: 'Arrived at desk',
      };

      const result = await controller.checkIn(dto, req, mockUser);
      expect(result).toEqual(mockResult);
      expect(mockAttendanceService.checkIn).toHaveBeenCalledWith(dto, '192.168.1.100', mockUser);
    });
  });

  describe('checkOut', () => {
    it('should delegate check-out to attendanceService', async () => {
      const mockResult = { id: 'att-1', checkOutTime: new Date() } as any;
      (mockAttendanceService.checkOut as jest.Mock).mockResolvedValue(mockResult);

      const dto = { notes: 'Done for the day' };
      const result = await controller.checkOut(dto, mockUser);
      expect(result).toEqual(mockResult);
      expect(mockAttendanceService.checkOut).toHaveBeenCalledWith(dto, mockUser);
    });
  });

  describe('getTodayStatus', () => {
    it('should return today status for current user', async () => {
      const mockResult = { hasCheckedIn: true, record: { id: 'att-1' } } as any;
      (mockAttendanceService.getTodayStatus as jest.Mock).mockResolvedValue(mockResult);

      const result = await controller.getTodayStatus(mockUser);
      expect(result).toEqual(mockResult);
      expect(mockAttendanceService.getTodayStatus).toHaveBeenCalledWith(mockUser);
    });
  });

  describe('listExceptions', () => {
    it('should return exceptions queue from service', async () => {
      const mockList = [{ id: 'exc-1', status: AttendanceStatus.ABSENT }] as any;
      (mockAttendanceService.listExceptions as jest.Mock).mockResolvedValue(mockList);

      const result = await controller.listExceptions(mockUser);
      expect(result).toEqual(mockList);
      expect(mockAttendanceService.listExceptions).toHaveBeenCalledWith(mockUser);
    });
  });

  describe('resolveException', () => {
    it('should delegate exception resolution to service', async () => {
      const mockResolved = { id: 'att-1', isResolved: true } as any;
      (mockAttendanceService.resolveException as jest.Mock).mockResolvedValue(mockResolved);

      const dto = {
        action: 'APPROVE' as const,
        notes: 'Verified remote work agreement',
      };

      const result = await controller.resolveException('att-1', dto, mockUser);
      expect(result).toEqual(mockResolved);
      expect(mockAttendanceService.resolveException).toHaveBeenCalledWith('att-1', dto, mockUser);
    });
  });
});
