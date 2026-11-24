import { expect, test } from '@playwright/test';

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  test(`CEO can schedule a shift policy at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.route('**/api/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      let data: unknown = [];
      if (path.endsWith('/auth/me/modules')) data = { allowedModules: ['dashboard', 'settings', 'payroll'] };
      else if (path.endsWith('/auth/me')) data = {
        id: 'ceo', role: 'COMPANY_ADMIN', companyId: 'tenant',
        company: { id: 'tenant', name: 'Test company', subscriptionTier: 'BASIC' },
      };
      else if (path.endsWith('/companies/me')) data = { id: 'tenant', name: 'Test company' };
      else if (path.endsWith('/shifts')) data = [{
        id: 'standard', name: 'Standard shift', startTime: '09:00', endTime: '17:00',
        breakDuration: 60, workDays: [1, 2, 3, 4, 5], revisions: [],
      }];
      else if (path.endsWith('/shifts/standard/revisions')) {
        data = { shiftId: 'standard', effectiveDate: '2099-01-01' };
      }
      return route.fulfill({ json: { data } });
    });
    await page.goto('/dashboard/settings');
    await page.getByRole('button', { name: 'Company Policies' }).click();
    const policy = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Shift and attendance policies' }) });
    await policy.getByRole('combobox', { name: 'Shift', exact: true }).selectOption('standard');
    await policy.getByLabel('Effective date').fill('2099-01-01');
    await policy.getByRole('spinbutton', { name: 'Required net work (minutes)', exact: true }).fill('420');
    await policy.getByLabel('Minimum for half day').fill('240');
    await policy.getByLabel('Minimum for full day').fill('420');
    const request = page.waitForRequest((item) => item.method() === 'POST' && item.url().endsWith('/shifts/standard/revisions'));
    await policy.getByRole('button', { name: 'Schedule shift policy' }).click();
    expect((await request).postDataJSON()).toMatchObject({
      effectiveDate: '2099-01-01', startTime: '09:00', endTime: '17:00',
      requiredMinutes: 420, halfDayMinutes: 240, fullDayMinutes: 420,
    });
    await expect(policy.getByRole('status')).toHaveText('Shift policy scheduled.');
  });
}

test('HR keeps payroll operations without salary policy controls', async ({ page }) => {
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (path.endsWith('/auth/me/modules')) data = { allowedModules: ['dashboard', 'payroll', 'settings'] };
    else if (path.endsWith('/auth/me')) data = {
      id: 'hr', role: 'HR_MANAGER', companyId: 'tenant',
      company: { id: 'tenant', name: 'Test company', subscriptionTier: 'BASIC' },
    };
    else if (path.endsWith('/payroll/structures')) data = [{ id: 's', name: 'Default package', baseSalary: 0, isDefault: true }];
    return route.fulfill({ json: { data } });
  });
  await page.goto('/dashboard/payroll');
  await expect(page.getByRole('heading', { name: 'Default package' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add Structure' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit Structure' })).toHaveCount(0);
  await page.goto('/dashboard/settings');
  await expect(page.getByRole('button', { name: 'Organization Profile' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Company Policies' })).toHaveCount(0);
});
