import { test, expect } from '@playwright/test';

async function fixture(page: import('@playwright/test').Page) {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/me/modules')) return route.fulfill({ json: { data: { role: 'EMPLOYEE', allowedModules: ['dashboard', 'my-attendance', 'work-timer', 'my-profile'] } } });
    if (path.endsWith('/auth/me')) return route.fulfill({ json: { data: { id: 'owner', role: 'EMPLOYEE', companyId: 'co', firstName: 'Test', lastName: 'User', company: { id: 'co', name: 'Company', subscriptionTier: 'PREMIUM' }, employee: { id: 'emp', status: 'ACTIVE' } } } });
    if (path.endsWith('/employees/emp')) return route.fulfill({ json: { data: { id: 'emp', userId: 'owner', firstName: 'Test', lastName: 'User', status: 'ACTIVE', country: 'USA', phone: 'legacy-invalid', nationality: '4677', city: '5789', emergencyContacts: [], documents: [] } } });
    if (path.endsWith('/analytics/overview')) return route.fulfill({ json: { data: { todaySummary: { present: 2, remote: 1, absent: 0, exceptions: 3 } } } });
    if (path.endsWith('/attendance/today')) return route.fulfill({ json: { data: { checkedIn: false } } });
    return route.fulfill({ json: { data: [] } });
  });
}

test('personal and contact forms validate changed values and show country codes', async ({ page }) => {
  await fixture(page);
  await page.goto('/dashboard/employees/emp');
  await page.getByRole('button', { name: 'Edit Personal Information' }).click();
  await page.locator('#personal-country').selectOption('PK');
  await expect(page.locator('#personal-phone')).toHaveAttribute('placeholder', '+92');
  await page.locator('#personal-country').selectOption('US');
  await expect(page.locator('#personal-phone')).toHaveAttribute('placeholder', '+1');
  await page.locator('#personal-city').fill('12345');
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByText('Enter a city containing a letter.')).toBeVisible();
  const patch = page.waitForRequest((request) => request.method() === 'PATCH' && request.url().endsWith('/employees/emp'));
  await page.locator('#personal-city').fill('São Paulo');
  await page.locator('#personal-phone').fill('+12025550102');
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByText('Personal information saved.')).toBeVisible();
  expect((await patch).postDataJSON()).not.toHaveProperty('nationality');
  await page.getByRole('button', { name: /Emergency Contacts/ }).click();
  await page.getByRole('button', { name: 'Add Contact' }).click();
  const dialog = page.getByText('Add Emergency Contact').locator('..');
  await dialog.getByPlaceholder('e.g. Maria Gonzalez').fill('123');
  await dialog.getByPlaceholder('e.g. Spouse, Parent, Sibling').fill('456');
  await dialog.getByPlaceholder('+1-555-0123').fill('123');
  await dialog.getByRole('button', { name: 'Add Contact' }).click();
  await expect(page.getByText('Enter a name containing a letter.')).toBeVisible();
  await expect(page.getByText('Enter a relationship containing a letter.')).toBeVisible();
  await expect(page.getByText('Enter a valid phone number including the country code.')).toBeVisible();
});

for (const size of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  test(`attendance chart and redirect at ${size.width}px`, async ({ page }) => {
    await page.setViewportSize(size);
    await fixture(page);
    await page.goto('/dashboard/work-timer');
    await expect(page).toHaveURL(/my-attendance$/);
    await expect(page.getByRole('heading', { name: 'Daily Punch' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Work Timer (Premium)' })).toBeVisible();
    await expect(page.locator('a[href="/dashboard/work-timer"]')).toHaveCount(0);
    await expect(page.getByText('Current attendance status counts.')).toBeVisible();
    const chart = page.locator('.recharts-wrapper').first();
    await chart.scrollIntoViewIfNeeded();
    await chart.locator('.recharts-surface').first().hover({ position: { x: 100, y: 100 } });
    const tip = chart.locator('[role=status]');
    await expect(tip).toContainText('Exceptions');
    await expect(tip).toContainText('3');
    const box = await tip.boundingBox();
    expect(box && box.width <= size.width).toBeTruthy();
  });
}

test('mobile touch tooltip stays inside the viewport in dark mode', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, colorScheme: 'dark' });
  const page = await context.newPage();
  await fixture(page);
  await page.goto('/dashboard/my-attendance');
  await expect(page.locator('html')).toHaveClass(/dark/);
  const chart = page.locator('.recharts-wrapper').first();
  await chart.scrollIntoViewIfNeeded();
  await expect(chart.getByText('Today', { exact: true })).toBeVisible();
  const surface = chart.locator('.recharts-surface').first();
  await surface.tap({ position: { x: 100, y: 100 } });
  const tip = chart.locator('[role=status]');
  await expect(tip).toContainText('Exceptions');
  await expect(tip).toContainText('3');
  const bounds = await tip.boundingBox();
  expect(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390).toBeTruthy();
  expect(await tip.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(24, 24, 27)');
  await context.close();
});
