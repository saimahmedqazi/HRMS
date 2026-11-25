import { expect, test } from '@playwright/test';

for (const width of [390, 1280]) {
  test(`reviewer narrows the Step 1 range at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.route('**/api/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname;
      let data: unknown = [];
      if (path.endsWith('/auth/me/modules')) data = { allowedModules: ['dashboard', 'leave-approvals'] };
      else if (path.endsWith('/auth/me')) data = { id: 'ceo', role: 'COMPANY_ADMIN', companyId: 'tenant',
        company: { id: 'tenant', name: 'Fixture', subscriptionTier: 'BASIC' } };
      else if (path.endsWith('/leave/requests')) data = [{
        id: 'request', employee: { userId: 'applicant', firstName: 'Lee' },
        leaveTypeSetting: { leaveType: 'CASUAL' }, status: 'PENDING', totalDays: 10,
        startDate: '2026-12-28', endDate: '2027-01-06', step1Status: 'APPROVED',
        step1ApprovedStart: '2026-12-30', step1ApprovedEnd: '2027-01-05', step2Status: 'PENDING',
      }];
      return route.fulfill({ json: { data } });
    });
    await page.goto('/dashboard/leave-approvals?requestId=request');
    await page.getByRole('button', { name: 'Partially approve', exact: true }).click();
    const start = page.getByLabel('Approved start');
    const end = page.getByLabel('Approved end');
    await expect(start).toHaveAttribute('min', '2026-12-30');
    await expect(end).toHaveAttribute('max', '2027-01-05');
    await start.fill('2026-12-30');
    await end.fill('2027-01-03');
    await expect(page.getByText('5 days approved', { exact: false })).toContainText('2027: 3');
    const confirm = page.getByRole('button', { name: 'Confirm Partial Approval' });
    await expect(confirm).toBeDisabled();
    await page.getByLabel('Reason for reducing leave', { exact: false }).fill('Year end coverage');
    const posted = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/request/step2'));
    await confirm.click();
    expect((await posted).postDataJSON()).toMatchObject({
      decision: 'PARTIAL', approvedStart: '2026-12-30', approvedEnd: '2027-01-03', partialReason: 'Year end coverage',
    });
  });
}

test('employee sees the approved dates, released balances and the public reason', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (path.endsWith('/auth/me/modules')) data = { allowedModules: ['dashboard', 'my-leave'] };
    else if (path.endsWith('/auth/me')) data = { id: 'employee', role: 'EMPLOYEE', companyId: 'tenant',
      employee: { id: 'emp', status: 'ACTIVE' },
      company: { id: 'tenant', name: 'Fixture', subscriptionTier: 'BASIC' } };
    else if (path.endsWith('/leave/requests')) data = [{
      id: 'request', employee: { userId: 'employee' }, leaveTypeSetting: { leaveType: 'CASUAL' },
      status: 'APPROVED', totalDays: 10, startDate: '2026-12-28', endDate: '2027-01-06',
      approvedStart: '2026-12-30', approvedEnd: '2027-01-03', approvedDays: 5,
      balanceDaysByYear: [{ year: 2026, days: 4 }, { year: 2027, days: 6 }],
      approvedDaysByYear: [{ year: 2026, days: 2 }, { year: 2027, days: 3 }],
      step1Status: 'APPROVED', step2Status: 'SKIPPED', step1PartialReason: 'Year end coverage',
      step1ActorName: 'Jane Reviewer', step1ActorRole: 'COMPANY_ADMIN',
      step1ApprovedStart: '2026-12-30', step1ApprovedEnd: '2027-01-03',
    }];
    return route.fulfill({ json: { data } });
  });
  await page.goto('/dashboard/my-leave');
  await page.getByText('Request details', { exact: true }).click();
  await expect(page.getByText('5 of 10 days', { exact: false })).toBeVisible();
  await expect(page.getByText('3 used · 3 released', { exact: false })).toBeVisible();
  await expect(page.getByText('Reason: Year end coverage')).toBeVisible();
  await expect(page.getByText('Reviewer: Jane Reviewer', { exact: false })).toBeVisible();
});
