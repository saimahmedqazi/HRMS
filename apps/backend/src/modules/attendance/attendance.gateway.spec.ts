import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Server } from 'socket.io';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { AttendanceGateway } from './attendance.gateway';

describe('AttendanceGateway session revocation', () => {
  it('delivers only to active connections and disconnects a revoked connection', async () => {
    const exp = Math.floor(Date.now() / 1000) + 60;
    const active = { data: { attendanceSession: { sub: 'active', exp } }, emit: jest.fn(), disconnect: jest.fn() };
    const revoked = { data: { attendanceSession: { sub: 'revoked', exp } }, emit: jest.fn(), disconnect: jest.fn() };
    const expired = { data: { attendanceSession: { sub: 'expired', exp: exp - 120 } }, emit: jest.fn(), disconnect: jest.fn() };
    const validate = jest.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('Session expired'));
    const gateway = new AttendanceGateway({} as JwtService, new ConfigService(), { validate } as unknown as JwtStrategy);
    const inRoom = jest.fn().mockReturnValue({ fetchSockets: jest.fn().mockResolvedValue([active, revoked, expired]) });
    gateway.server = { in: inRoom } as unknown as Server;

    await gateway.broadcastBreakAlert('company-1', ['active', 'revoked', 'expired']);

    expect(inRoom).toHaveBeenCalledWith(['attendance_company-1_active', 'attendance_company-1_revoked', 'attendance_company-1_expired']);
    expect(validate).toHaveBeenCalledTimes(2);
    expect(active.emit).toHaveBeenCalledWith('break_alert');
    expect(revoked.emit).not.toHaveBeenCalled();
    expect(expired.emit).not.toHaveBeenCalled();
    expect(revoked.disconnect).toHaveBeenCalledTimes(1);
    expect(expired.disconnect).toHaveBeenCalledTimes(1);
  });
});
