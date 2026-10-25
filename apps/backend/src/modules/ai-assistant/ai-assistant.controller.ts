import {
  Controller,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SubscriptionTier } from '@prisma/client';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { SubscriptionTierGuard } from '@common/guards/subscription-tier.guard';
import { RequireSubscriptionTier } from '@common/decorators/require-subscription-tier.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { AiAssistantService } from './ai-assistant.service';
import { ChatRequestDto } from './dto/chat-request.dto';

@ApiTags('Gemini AI Assistant')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, SubscriptionTierGuard)
@RequireSubscriptionTier(SubscriptionTier.PREMIUM)
@Controller('ai')
export class AiAssistantController {
  constructor(private readonly aiAssistantService: AiAssistantService) {}

  @Post('chat')
  @ApiOperation({
    summary: 'Chat with ZenHR Google Gemini HR policy assistant (Premium tier gated)',
  })
  async chat(
    @CurrentUser() user: any,
    @Body() dto: ChatRequestDto,
  ) {
    return this.aiAssistantService.processQuery(
      user.companyId,
      user.id,
      user.role,
      dto,
    );
  }
}
