import { test, expect } from '@playwright/test';

test('AI Assistant hides the backend model version from users', async ({ page }) => {
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/me')) return route.fulfill({ json: { data: {
      id: 'fixture-employee', role: 'EMPLOYEE', companyId: 'fixture-company',
    } } });
    if (path.endsWith('/auth/me/modules')) return route.fulfill({ json: { data: { allowedModules: ['ai-assistant'] } } });
    if (path.endsWith('/subscriptions/current')) return route.fulfill({ json: { data: {
      status: 'ACTIVE', features: { aiAssistant: true },
    } } });
    if (path.endsWith('/notifications')) return route.fulfill({ json: { data: [] } });
    return route.fulfill({ json: { data: [] } });
  });

  await page.goto('/dashboard/ai-assistant');
  await expect(page.getByRole('heading', { name: 'ZenHR Gemini Assistant' })).toBeVisible();
  await expect(page.getByText('Gemini 2.0 Flash', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Ask the HR assistant')).toBeEnabled();
});
