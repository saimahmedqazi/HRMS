import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { appConfig } from './common/config/app.config';
import { PrismaModule } from './common/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { SuperAdminModule } from './modules/super-admin/super-admin.module';
import { DepartmentsModule } from './modules/organization/departments/departments.module';
import { DesignationsModule } from './modules/organization/designations/designations.module';
import { TeamsModule } from './modules/organization/teams/teams.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { WorkTimerModule } from './modules/work-timer/work-timer.module';
import { LeaveModule } from './modules/leave/leave.module';
import { ResourcesModule } from './modules/resources/resources.module';
import { RequestContextModule } from './common/request-context/request-context.module';
import { MailModule } from './common/mail/mail.module';

@Module({
  imports: [
    // Config — loads .env and validates
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      validationOptions: {
        allowUnknown: false,
        abortEarly: false,
      },
    }),

    // Rate limiting (auth endpoints: stricter limits applied per-route)
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 60000, // 1 minute
        limit: 60,
      },
      {
        name: 'long',
        ttl: 900000, // 15 minutes
        limit: 300,
      },
    ]),

    // Cron scheduling (nightly absence job, etc.)
    ScheduleModule.forRoot(),

    // Core modules
    RequestContextModule,
    PrismaModule,
    MailModule,

    // Feature modules
    AuthModule,
    CompaniesModule,
    EmployeesModule,
    SuperAdminModule,
    DepartmentsModule,
    DesignationsModule,
    TeamsModule,
    AttendanceModule,
    WorkTimerModule,
    LeaveModule,
    ResourcesModule,
  ],
})
export class AppModule {}
