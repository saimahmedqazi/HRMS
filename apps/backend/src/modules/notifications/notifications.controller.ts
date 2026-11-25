import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiCookieAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { AuthenticatedUser, CurrentUser } from '@common/decorators/current-user.decorator';
import { PrismaService } from '@common/prisma/prisma.service';

@ApiTags('Notifications')
@ApiCookieAuth()
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
  @ApiOperation({ summary: 'Get user notifications (recent array by default, or paginated history)' })
  async getNotifications(
    @CurrentUser() user: AuthenticatedUser,
    @Query('paginated') paginated?: string,
    @Query('page') pageParam?: string,
    @Query('limit') limitParam?: string,
    @Query('status') status?: string,
  ) {
    const scope = this.accountScope(user);

    if (!paginated && !pageParam && !limitParam && !status) {
      return this.prisma.notification.findMany({
        where: scope,
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
    }

    const page = Math.max(1, Number.parseInt(pageParam || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(limitParam || '20', 10) || 20));
    const skip = (page - 1) * limit;

    const statusWhere =
      status === 'unread'
        ? { isRead: false }
        : status === 'read'
          ? { isRead: true }
          : {};

    const where = { ...scope, ...statusWhere };

    const [items, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { ...scope, isRead: false } }),
    ]);

    return {
      items,
      total,
      unreadCount,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get total unread notification count for current user' })
  async getUnreadCount(@CurrentUser() user: AuthenticatedUser) {
    const scope = this.accountScope(user);
    const unreadCount = await this.prisma.notification.count({
      where: { ...scope, isRead: false },
    });
    return { unreadCount };
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

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a single notification as read for current user' })
  async markRead(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = this.accountScope(user);
    const existing = await this.prisma.notification.findFirst({
      where: { id, ...scope },
    });

    if (!existing) {
      throw new NotFoundException('Notification not found');
    }

    if (existing.isRead) {
      return existing;
    }

    const readAt = new Date();
    const updated = await this.prisma.notification.updateMany({
      where: { id: existing.id, ...scope, isRead: false },
      data: { isRead: true, readAt },
    });

    if (updated.count === 0) {
      const latest = await this.prisma.notification.findFirst({
        where: { id: existing.id, ...scope },
      });
      if (!latest) throw new NotFoundException('Notification not found');
      return latest;
    }

    return {
      ...existing,
      isRead: true,
      readAt,
    };
  }
}
