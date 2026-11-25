import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '@common/prisma/prisma.service';
import { NotificationsController } from './notifications.controller';

describe('NotificationsController', () => {
  const notification = {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    updateMany: jest.fn(),
  };
  const controller = new NotificationsController({ notification } as unknown as PrismaService);

  beforeEach(() => jest.clearAllMocks());

  it.each([
    { companyId: 'acme', role: 'EMPLOYEE', expectedCompanyId: 'acme' },
    { companyId: null, role: 'SUPER_ADMIN', expectedCompanyId: null },
    { companyId: 'acme', supportModeCompanyId: 'acme', role: 'SUPER_ADMIN', expectedCompanyId: null },
  ])('scopes both inbox operations for $role in $companyId', async ({ expectedCompanyId, ...account }) => {
    const user = { ...account, id: 'user-1', email: 'fixture@example.test' };

    await controller.getNotifications(user);
    await controller.markAllRead(user);

    expect(notification.findMany).toHaveBeenCalledWith({
      where: { userId: user.id, companyId: expectedCompanyId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    expect(notification.updateMany).toHaveBeenCalledWith({
      where: { userId: user.id, companyId: expectedCompanyId, isRead: false },
      data: { isRead: true, readAt: expect.any(Date) },
    });
  });

  it('supports paginated filtered notification history and unread count', async () => {
    const user = { id: 'user-1', email: 'fixture@example.test', role: 'EMPLOYEE', companyId: 'acme' };
    notification.findMany.mockResolvedValueOnce([{ id: 'n-1' }]);
    notification.count.mockResolvedValueOnce(25).mockResolvedValueOnce(4);

    const res = await controller.getNotifications(user, 'true', '2', '10', 'unread');

    expect(notification.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', companyId: 'acme', isRead: false },
      orderBy: { createdAt: 'desc' },
      skip: 10,
      take: 10,
    });
    expect(res).toEqual({
      items: [{ id: 'n-1' }],
      total: 25,
      unreadCount: 4,
      page: 2,
      limit: 10,
      totalPages: 3,
    });
  });

  it('marks a single notification read idempotently and rejects cross-user/tenant access', async () => {
    const user = { id: 'user-1', email: 'fixture@example.test', role: 'EMPLOYEE', companyId: 'acme' };
    const existingReadAt = new Date('2026-11-20T10:00:00Z');

    // Already read -> idempotent, preserves readAt
    notification.findFirst.mockResolvedValueOnce({ id: 'n-1', isRead: true, readAt: existingReadAt });
    const alreadyRead = await controller.markRead('n-1', user);
    expect(alreadyRead.readAt).toEqual(existingReadAt);
    expect(notification.updateMany).not.toHaveBeenCalled();

    // Unread -> updates scoped to user & company
    notification.findFirst.mockResolvedValueOnce({ id: 'n-2', isRead: false, readAt: null });
    notification.updateMany.mockResolvedValueOnce({ count: 1 });
    const marked = await controller.markRead('n-2', user);
    expect(marked.isRead).toBe(true);
    expect(marked.readAt).toBeInstanceOf(Date);

    // Missing / another user's notification -> 404
    notification.findFirst.mockResolvedValueOnce(null);
    await expect(controller.markRead('n-other', user)).rejects.toThrow(NotFoundException);
  });

  it('rejects a missing account ID before issuing either query', async () => {
    const user = { email: 'fixture@example.test', role: 'EMPLOYEE', companyId: 'acme' };

    await expect(controller.getNotifications(user)).rejects.toThrow(UnauthorizedException);
    await expect(controller.markAllRead(user)).rejects.toThrow(UnauthorizedException);
    await expect(controller.markRead('n-1', user)).rejects.toThrow(UnauthorizedException);
    expect(notification.findMany).not.toHaveBeenCalled();
    expect(notification.updateMany).not.toHaveBeenCalled();
  });
});
