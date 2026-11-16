import { test, expect } from '@playwright/test';

test.describe('Authentication presentation', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/v1/auth/me', (route) => route.fulfill({ status: 401, json: { message: 'Not signed in' } }));
    await page.route('**/api/v1/auth/refresh', (route) => route.fulfill({ status: 401, json: { message: 'Not signed in' } }));
  });

  for (const path of ['/login', '/register']) {
    test(`${path} shows the photo panel and disclosed sample quote`, async ({ page }) => {
      await page.goto(path);
      const panel = page.getByRole('region', { name: 'ZenHR introduction', exact: true });
      await expect(panel).toBeVisible();
      await expect(panel).toContainText('Fictional demo quote');
      await expect(panel).toContainText('Sample testimonial');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }

  test('sample testimonial controls change the quote and wrap around', async ({ page }) => {
    await page.goto('/login');
    const panel = page.getByRole('region', { name: 'Sample testimonials', exact: true });
    await expect(panel).toContainText('HR team lead');
    await page.getByRole('button', { name: 'Next sample testimonial' }).click();
    await expect(panel).toContainText('People operations');
    await page.getByRole('button', { name: 'Previous sample testimonial' }).click();
    await expect(panel).toContainText('HR team lead');
  });

  test('browser scrollbar uses the ZenHR theme while staying visible', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('html')).toHaveCSS('scrollbar-width', 'thin');
  });

  for (const width of [320, 390, 768, 1280]) {
    test(`auth pages fit a ${width}px viewport`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/register');
      await expect(page.getByLabel(/Company Name/)).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }
});
