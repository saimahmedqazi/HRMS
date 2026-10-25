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

export interface BreakAlertPayload {
  employeeId: string;
  employeeName: string;
  departmentName?: string;
  shiftBreakLimit: number;
  actualBreakMinutes: number;
  timestamp: string;
}

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

      const secret = this.configService.get<string>('app.jwt.accessSecret', 'change-in-production');
      const payload = this.jwtService.verify(token, { secret });

      // Join tenant room and user room
      if (payload.companyId) {
        client.join(`company_${payload.companyId}`);
      }
      client.join(`user_${payload.sub}`);

      // If Company Admin / CEO
      if (payload.role === 'COMPANY_ADMIN') {
        client.join(`ceo_${payload.companyId}`);
      }
      // If HR Manager
      if (payload.role === 'HR_MANAGER') {
        client.join(`hr_${payload.companyId}`);
      }

      this.logger.debug(`Client ${client.id} connected for user ${payload.sub}`);
    } catch (err) {
      this.logger.warn(`Unauthorized WebSocket connection attempt: ${client.id}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  // Emits real-time break overstay alert to Team Lead, Dept Manager, and CEO rooms
  broadcastBreakAlert(
    companyId: string,
    teamLeadId: string | undefined,
    departmentManagerId: string | undefined,
    payload: BreakAlertPayload,
  ) {
    if (!this.server) return;

    // 1. Emit to CEO / Company Admin room
    this.server.to(`ceo_${companyId}`).emit('break_alert', payload);

    // 2. Emit to HR room
    this.server.to(`hr_${companyId}`).emit('break_alert', payload);

    // 3. Emit to Dept Manager if assigned
    if (departmentManagerId) {
      this.server.to(`user_${departmentManagerId}`).emit('break_alert', payload);
    }

    // 4. Emit to Team Lead if assigned
    if (teamLeadId) {
      this.server.to(`user_${teamLeadId}`).emit('break_alert', payload);
    }
  }

  // Emits unauthorized remote check-in exception to HR room
  broadcastAttendanceException(companyId: string, payload: AttendanceExceptionPayload) {
    if (!this.server) return;
    this.server.to(`hr_${companyId}`).emit('attendance_exception', payload);
  }
}
