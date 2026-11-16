import { test, expect, Page } from '@playwright/test';

async function mockPlatformSession(page: Page, role: 'SUPER_ADMIN' | 'OPERATION_MANAGER') {
  page.on('pageerror', (error) => console.error(`Browser page error: ${error.stack || error.message}`));
  let resetCalls = 0;
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (path.endsWith('/auth/me')) {
      return route.fulfill({ json: { data: {
        id: 'platform-user',
        email: role === 'SUPER_ADMIN' ? 'superadmin@zenhr.com' : 'ops@zenhr.com',
        firstName: 'Platform',
        lastName: 'Account',
        role,
        companyId: null,
      } } });
    }
    if (path.endsWith('/auth/me/modules')) {
      return route.fulfill({ json: { data: { role, allowedModules: [] } } });
    }
    if (path.endsWith('/notifications')) return route.fulfill({ json: { data: [] } });
    if (path.endsWith('/super-admin/platform-accounts/operation-manager/reset-password')) {
      resetCalls += 1;
      return route.fulfill({ json: { data: {
        email: 'ops@zenhr.com',
        temporaryPassword: 'one-time-password-fixture-8V2z0N',
        twoFactorEnabled: false,
        message: 'Temporary password created.',
      } } });
    }
    return route.fulfill({ json: { data: [] } });
  });

  return () => resetCalls;
}

test('Super Admin can issue a one-time OP password and sees it only after confirmation', async ({ page }) => {
  const resetCalls = await mockPlatformSession(page, 'SUPER_ADMIN');
  page.on('dialog', (dialog) => dialog.accept());

  await page.goto('/dashboard/settings');
  await expect(page.getByRole('heading', { name: 'Operation Manager Account Recovery' })).toBeVisible();
  await expect(page.getByText('one-time-password-fixture-8V2z0N')).toHaveCount(0);

  await page.getByRole('button', { name: 'Reset Operation Manager Access' }).click();

  await expect(page.getByText('one-time-password-fixture-8V2z0N')).toBeVisible();
  expect(resetCalls()).toBe(1);
});

test('Operation Manager cannot see the OP password reset control', async ({ page }) => {
  await mockPlatformSession(page, 'OPERATION_MANAGER');

  await page.goto('/dashboard/settings');
  await expect(page.getByRole('heading', { name: 'Platform & Tenant Settings' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reset Operation Manager Access' })).toHaveCount(0);
});
