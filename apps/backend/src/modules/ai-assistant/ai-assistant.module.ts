import { Module } from '@nestjs/common';
import { PrismaModule } from '@common/prisma/prisma.module';
import { LeaveModule } from '../leave/leave.module';
import { AiAssistantService } from './ai-assistant.service';
import { AiAssistantController } from './ai-assistant.controller';

@Module({
  imports: [PrismaModule, LeaveModule],
  controllers: [AiAssistantController],
  providers: [AiAssistantService],
  exports: [AiAssistantService],
})
export class AiAssistantModule {}
