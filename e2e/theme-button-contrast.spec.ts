import { test, expect } from '@playwright/test';

test('resource request primary action has a readable light-mode background', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('theme', 'light'));
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/me')) return route.fulfill({ json: { data: {
      id: 'fixture-employee', role: 'EMPLOYEE', companyId: 'fixture-company',
    } } });
    if (path.endsWith('/auth/me/modules')) return route.fulfill({ json: { data: { allowedModules: ['resources'] } } });
    if (path.endsWith('/resources/requests')) return route.fulfill({ json: { data: [] } });
    if (path.endsWith('/notifications')) return route.fulfill({ json: { data: [] } });
    return route.fulfill({ json: { data: [] } });
  });

  await page.goto('/dashboard/resources');
  const requestButton = page.getByRole('button', { name: 'Request Resource', exact: true });
  await expect(requestButton).toBeVisible();
  const colors = await requestButton.evaluate((button) => ({
    background: getComputedStyle(button).backgroundColor,
    foreground: getComputedStyle(button).color,
  }));
  expect(colors.background).not.toBe('rgba(0, 0, 0, 0)');
  expect(colors.background).not.toBe('rgb(255, 255, 255)');
  expect(colors.foreground).toBe('rgb(255, 255, 255)');
});
