import { test, expect } from '@playwright/test';

test('Super Admin direct tenant links stay closed outside Support Mode', async ({ page }) => {
  let employeeListRequested = false;

  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/me/modules')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          role: 'SUPER_ADMIN',
          allowedModules: ['dashboard', 'companies', 'support-mode', 'billing', 'settings', 'my-profile'],
        }),
      });
      return;
    }

    if (!path.endsWith('/auth/me')) {
      if (path.endsWith('/employees')) employeeListRequested = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'platform-admin',
        email: 'admin@example.test',
        role: 'SUPER_ADMIN',
        firstName: 'Platform',
        lastName: 'Admin',
        companyId: null,
        employee: null,
      }),
    });
  });
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/v1/employees') employeeListRequested = true;
  });

  await page.goto('/dashboard/employees');
  await expect(page.getByRole('heading', { name: 'Access Denied' })).toBeVisible();
  await expect(page.getByRole('button', { name: /onboard employee/i })).toHaveCount(0);
  expect(employeeListRequested).toBe(false);
});

test('Super Admin Support Mode shows tenant attendance without employee punch calls', async ({ page }) => {
  let personalAttendanceCalled = false;
  let personalTimerCalled = false;

  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/me/modules')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ role: 'SUPER_ADMIN', allowedModules: ['dashboard', 'attendance', 'support-mode'] }),
      });
      return;
    }
    if (path.endsWith('/auth/me')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'platform-admin', email: 'admin@example.test', role: 'SUPER_ADMIN',
          firstName: 'Platform', lastName: 'Admin', companyId: null,
          supportModeCompanyId: 'company-1',
          supportModeCompany: { id: 'company-1', name: 'Acme Corporation', subscriptionTier: 'PREMIUM', status: 'ACTIVE' },
          employee: null,
        }),
      });
      return;
    }
    if (path.endsWith('/attendance/today')) personalAttendanceCalled = true;
    if (path.endsWith('/timer/today')) personalTimerCalled = true;
    if (path.endsWith('/attendance/ip-whitelist')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { entries: [], currentClientIp: null } }) });
      return;
    }
    if (path.endsWith('/analytics/overview')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { todaySummary: { present: 4, remote: 2, absent: 1, exceptions: 0 } } }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
  });

  await page.goto('/dashboard/attendance', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Attendance & Work Timer' })).toBeVisible();
  await expect(page.getByText(/available to users with an employee profile/i).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Punch In Now' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Punch Out & Conclude Shift' })).toHaveCount(0);
  await expect(page.getByText(/today's attendance couldn't load/i)).toHaveCount(0);
  await expect(page.getByText(/the work timer couldn't load/i)).toHaveCount(0);
  expect(personalAttendanceCalled).toBe(false);
  expect(personalTimerCalled).toBe(false);
});
