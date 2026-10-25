import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { AttendanceGateway } from './attendance.gateway';
import { AttendanceCronService } from './attendance.cron';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { MailModule } from '../../common/mail/mail.module';
import { DataScopeModule } from '../../common/services/data-scope.module';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [PrismaModule, MailModule, DataScopeModule, JwtModule.register({})],
  controllers: [AttendanceController],
  providers: [AttendanceService, AttendanceGateway, AttendanceCronService],
  exports: [AttendanceService, AttendanceGateway],
})
export class AttendanceModule {}
