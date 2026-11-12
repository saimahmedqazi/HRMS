import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload, JwtStrategy } from '../auth/strategies/jwt.strategy';

export interface AttendanceExceptionPayload {
  attendanceId: string;
  employeeId: string;
  employeeName: string;
  date: string;
  checkInTime: string;
  ipAddress?: string;
  timestamp: string;
}

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
  namespace: '/ws/attendance',
})
export class AttendanceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(AttendanceGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly jwtStrategy: JwtStrategy,
  ) {}

  async handleConnection(client: Socket) {
    try {
      // Extract access_token from cookies or auth header
      const cookies = client.handshake.headers.cookie;
      let token = client.handshake.auth?.token;

      if (!token && cookies) {
        const match = cookies.match(/access_token=([^;]+)/);
        if (match) token = match[1];
      }

      if (!token) {
        client.disconnect();
        return;
      }

      const secret = this.configService.getOrThrow<string>('app.jwt.accessSecret');
      const payload = this.jwtService.verify<JwtPayload>(token, { secret });
      const user = await this.jwtStrategy.validate(payload);
      if (!client.connected) return;

      const expiresIn = payload.exp! * 1000 - Date.now();
      if (expiresIn <= 0) {
        client.disconnect();
        return;
      }
      const expiration = setTimeout(() => client.disconnect(), expiresIn);
      expiration.unref();
      client.once('disconnect', () => clearTimeout(expiration));
      client.data.attendanceSession = payload;

      // Join tenant room and user room
      if (user.companyId) {
        client.join(`company_${user.companyId}`);
      }
      if (user.companyId) await client.join(`attendance_${user.companyId}_${user.id}`);

      // If Company Admin / CEO
      if (user.role === 'COMPANY_ADMIN') {
        client.join(`ceo_${user.companyId}`);
      }
      // If HR Manager
      if (user.role === 'HR_MANAGER') {
        client.join(`hr_${user.companyId}`);
      }

      client.emit('attendance_ready');
      this.logger.debug(`Client ${client.id} connected for user ${user.id}`);
    } catch (err) {
      this.logger.warn(`Unauthorized WebSocket connection attempt: ${client.id}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  async broadcastBreakAlert(companyId: string, recipientIds: string[]) {
    if (!recipientIds.length) return;
    // Clients reload notification details through the authenticated HTTP API.
    await this.emitToCurrentSessions(recipientIds.map((id) => `attendance_${companyId}_${id}`), 'break_alert');
  }

  // Emits unauthorized remote check-in exception to HR room
  async broadcastAttendanceException(companyId: string, payload: AttendanceExceptionPayload) {
    await this.emitToCurrentSessions(`hr_${companyId}`, 'attendance_exception', payload);
  }

  private async emitToCurrentSessions(
    rooms: string | string[],
    event: 'break_alert' | 'attendance_exception',
    ...args: [] | [AttendanceExceptionPayload]
  ) {
    if (!this.server) return;
    try {
      const sockets = await this.server.in(rooms).fetchSockets();
      await Promise.all(sockets.map(async (socket) => {
        const session: JwtPayload | undefined = socket.data.attendanceSession;
        if (!session?.exp || session.exp * 1000 <= Date.now()) {
          socket.disconnect();
          return;
        }

        try {
          await this.jwtStrategy.validate(session);
        } catch {
          socket.disconnect();
          return;
        }
        socket.emit(event, ...args);
      }));
    } catch {
      this.logger.warn(`Could not deliver ${event} to attendance sessions.`);
    }
  }
}
