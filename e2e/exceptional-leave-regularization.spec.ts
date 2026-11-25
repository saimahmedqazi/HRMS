import { expect, test } from '@playwright/test';

const unpaid = { id: 'unpaid', leaveType: 'UNPAID', isActive: true, isPaid: false, enforceEntitlement: false,
  annualAllocation: 0, allowDuringProbation: true, requiresReason: true, requiresMedicalCert: false };
const policy = { regularizationEnabled: true, regularizationLookback: 30, regularizationExceptional: true,
  regularizationDocument: false, dates: ['2026-11-16', '2026-11-17', '2026-11-19'] };
for (const width of [390, 1280]) {
  test(`employee requests unpaid regularization at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ colorScheme: width === 390 ? 'dark' : 'light' });
    await page.route('**/api/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname;
      let data: unknown = [];
      if (path.endsWith('/auth/me/modules')) data = { allowedModules: ['dashboard', 'my-leave', 'my-attendance'] };
      else if (path.endsWith('/auth/me')) data = { id: 'employee', role: 'EMPLOYEE', companyId: 'tenant',
        employee: { id: 'emp', status: 'ACTIVE' }, company: { id: 'tenant', name: 'Fixture', subscriptionTier: 'BASIC' } };
      else if (path.endsWith('/leave/types')) data = [unpaid];
      else if (path.endsWith('/regularization/eligible')) data = policy;
      return route.fulfill({ json: { data } });
    });
    await page.goto('/dashboard/my-leave?regularize=1');
    const dialog = page.getByRole('dialog', { name: 'Regularize absence' });
    await expect(dialog.getByText('UNPAID (unpaid · no entitlement deduction)')).toBeAttached();
    await dialog.getByLabel('First absence date').selectOption('2026-11-16');
    const last = dialog.getByLabel('Last absence date');
    await expect(last.locator('option', { hasText: '2026-11-19' })).toHaveCount(0);
    await last.selectOption('2026-11-17');
    await dialog.getByLabel('Reason').fill('Family emergency');
    const posted = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/leave/requests'));
    await dialog.getByRole('button', { name: 'Submit Leave Request' }).click();
    expect((await posted).postData()).toContain('RETROSPECTIVE');
    await expect(dialog).toBeHidden();
    await page.getByRole('button', { name: 'Request additional leave' }).click();
    await expect(page.getByRole('dialog', { name: 'Request additional leave' })).toBeVisible();
  });
}

test('CEO can configure disabled exceptional leave and retrospective policy', async ({ page }) => {
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (path.endsWith('/auth/me/modules')) data = { allowedModules: ['dashboard', 'settings', 'payroll'] };
    else if (path.endsWith('/auth/me')) data = { id: 'ceo', role: 'COMPANY_ADMIN', companyId: 'tenant',
      company: { id: 'tenant', name: 'Fixture', subscriptionTier: 'BASIC' } };
    else if (path.endsWith('/companies/me')) data = { id: 'tenant', name: 'Fixture' };
    else if (path.endsWith('/regularization/policy')) data = { ...policy, regularizationEnabled: false };
    else if (path.endsWith('/leave/types')) data = [{ ...unpaid, isActive: false }];
    return route.fulfill({ json: { data } });
  });
  await page.goto('/dashboard/settings');
  await page.getByRole('button', { name: 'Company Policies' }).click();
  await page.getByLabel('Enable absence regularization').check();
  const savePolicy = page.waitForRequest((request) => request.method() === 'PATCH' && request.url().endsWith('/regularization/policy'));
  await page.getByRole('button', { name: 'Save regularization policy' }).click();
  expect((await savePolicy).postDataJSON()).toMatchObject({ regularizationEnabled: true, regularizationLookback: 30 });
  await page.getByLabel('Available to employees').check();
  const saveUnpaid = page.waitForRequest((request) => request.method() === 'PATCH' && request.url().endsWith('/leave/types/unpaid'));
  await page.getByRole('button', { name: 'Save unpaid policy' }).click();
  expect((await saveUnpaid).postDataJSON()).toMatchObject({ isActive: true, isPaid: false, enforceEntitlement: false });
});
