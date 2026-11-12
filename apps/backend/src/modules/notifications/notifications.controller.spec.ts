import { UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '@common/prisma/prisma.service';
import { NotificationsController } from './notifications.controller';

describe('NotificationsController', () => {
  const notification = { findMany: jest.fn(), updateMany: jest.fn() };
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

  it('rejects a missing account ID before issuing either query', async () => {
    const user = { email: 'fixture@example.test', role: 'EMPLOYEE', companyId: 'acme' };

    await expect(controller.getNotifications(user)).rejects.toThrow(UnauthorizedException);
    await expect(controller.markAllRead(user)).rejects.toThrow(UnauthorizedException);
    expect(notification.findMany).not.toHaveBeenCalled();
    expect(notification.updateMany).not.toHaveBeenCalled();
  });
});
