import { test, expect } from '@playwright/test';

for (const width of [390, 1280]) {
  test(`leave history and annual balance at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.route('**/api/v1/**', (route) => {
      const url = new URL(route.request().url());
      let data: unknown = [];
      if (url.pathname.endsWith('/auth/me/modules')) data = { allowedModules: ['dashboard', 'my-leave'] };
      else if (url.pathname.endsWith('/auth/me')) data = {
        id: 'user-1', role: 'EMPLOYEE', companyId: 'company-1',
        employee: { id: 'emp-1', status: 'ACTIVE' },
        company: { id: 'company-1', name: 'Test', subscriptionTier: 'BASIC' },
      };
      else if (url.pathname.endsWith('/leave/types')) data = [{ id: 'type', leaveType: 'CASUAL', isActive: true }];
      else if (url.pathname.endsWith('/leave/balances')) data = [{ id: 'balance', leaveType: 'CASUAL', year: Number(url.searchParams.get('year')), initialized: false }];
      else if (url.pathname.endsWith('/leave/requests')) data = [{
        id: 'req', employee: { userId: 'user-1' }, leaveTypeSetting: { leaveType: 'CASUAL' },
        startDate: '2026-12-30', endDate: '2027-01-06', totalDays: 8,
        balanceDaysByYear: [{ year: 2026, days: 2 }, { year: 2027, days: 6 }],
        status: 'REJECTED', step1Status: 'REJECTED', step2Status: 'PENDING',
        step1ActorName: 'HR Reviewer', step1ActorRole: 'HR_MANAGER', step1Notes: 'Coverage unavailable',
        step1ApprovedAt: '2026-11-24T12:00:00Z',
      }];
      return route.fulfill({ json: { data } });
    });
    await page.goto('/dashboard/my-leave');
    await expect(page.getByText('Balance not initialized for this year.')).toBeVisible();
    const yearRequest = page.waitForRequest((request) => request.url().includes('/leave/balances?year=2027'));
    await page.getByLabel('Balance year').fill('2027');
    await yearRequest;
    await page.getByText('Request details').click();
    await expect(page.getByText('2026: 2 days released')).toBeVisible();
    await expect(page.getByText('2027: 6 days released')).toBeVisible();
    await expect(page.getByText('Reviewer: HR Reviewer (HR MANAGER)')).toBeVisible();
    await expect(page.getByText('Reason: Coverage unavailable')).toBeVisible();
    await expect(page.getByText('Step 2: Not reached')).toBeVisible();
  });
}
