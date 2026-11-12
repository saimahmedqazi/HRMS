import { Controller, Get, Patch, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { AuthenticatedUser, CurrentUser } from '@common/decorators/current-user.decorator';
import { PrismaService } from '@common/prisma/prisma.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  private accountScope(user: AuthenticatedUser) {
    const userId = user.id || user.sub;
    if (!userId) throw new UnauthorizedException('Invalid access session');

    // Support Mode changes the workspace, while the administrator retains their own inbox.
    const companyId = user.supportModeCompanyId ? null : user.companyId ?? null;
    return { userId, companyId };
  }

  @Get()
  @ApiOperation({ summary: 'Get user notifications (last 50, newest first)' })
  async getNotifications(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.notification.findMany({
      where: this.accountScope(user),
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  @Patch('mark-all-read')
  @ApiOperation({ summary: 'Mark all notifications as read for current user' })
  async markAllRead(@CurrentUser() user: AuthenticatedUser) {
    await this.prisma.notification.updateMany({
      where: { ...this.accountScope(user), isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { success: true };
  }
}
