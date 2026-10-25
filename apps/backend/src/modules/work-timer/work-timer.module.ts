import { Module } from '@nestjs/common';
import { WorkTimerController } from './work-timer.controller';
import { WorkTimerService } from './work-timer.service';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { MailModule } from '../../common/mail/mail.module';
import { AttendanceModule } from '../attendance/attendance.module';

@Module({
  imports: [PrismaModule, MailModule, AttendanceModule],
  controllers: [WorkTimerController],
  providers: [WorkTimerService],
  exports: [WorkTimerService],
})
export class WorkTimerModule {}
