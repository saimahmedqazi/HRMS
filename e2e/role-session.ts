import { expect, test, type BrowserContext } from '@playwright/test';

export function useRoleSession(email: string, password: string) {
  let cookies: Awaited<ReturnType<BrowserContext['cookies']>>;

  test.beforeAll(async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL });
    try {
      const page = await context.newPage();
      await page.goto('/login');
      await page.locator('input[type="email"]').fill(email);
      await page.locator('input[type="password"]').fill(password);
      await page.getByRole('button', { name: 'Sign In', exact: true }).click();
      await expect(page).toHaveURL(/\/dashboard$/);
      cookies = await context.cookies();
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    await page.context().addCookies(cookies);
    await page.goto('/dashboard');
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
  });
}
