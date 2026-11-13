import { expect, test, type BrowserContext } from '@playwright/test';

export function useRoleSession(email: string, password: string) {
  let cookies: Awaited<ReturnType<BrowserContext['cookies']>>;

  test.beforeAll(async ({ browser, baseURL }, testInfo) => {
    testInfo.setTimeout(120_000);
    const context = await browser.newContext({ baseURL });
    const sessionRequests: string[] = [];
    try {
      const page = await context.newPage();
      const sessionPaths = new Set(['/api/v1/auth/login', '/api/v1/auth/me', '/api/v1/auth/refresh']);
      page.on('response', (response) => {
        const path = new URL(response.url()).pathname;
        if (sessionPaths.has(path)) sessionRequests.push(`${path}: ${response.status()}`);
      });
      page.on('requestfailed', (request) => {
        const path = new URL(request.url()).pathname;
        if (sessionPaths.has(path)) sessionRequests.push(`${path}: ${request.failure()?.errorText ?? 'network failure'}`);
      });
      await page.goto('/login');
      await page.locator('input[type="email"]').fill(email);
      await page.locator('input[type="password"]').fill(password);
      const signIn = async () => {
        const [response] = await Promise.all([
          page.waitForResponse((response) =>
            new URL(response.url()).pathname === '/api/v1/auth/login' && response.request().method() === 'POST'),
          page.getByRole('button', { name: 'Sign In', exact: true }).click(),
        ]);
        return response;
      };
      let response = await signIn();
      if (response.status() === 429) {
        const seconds = Number(response.headers()['retry-after-short'] ?? response.headers()['retry-after']);
        if (Number.isFinite(seconds) && seconds >= 0 && seconds <= 60) {
          await new Promise((resolve) => setTimeout(resolve, (seconds + 1) * 1000));
          response = await signIn();
        }
      }
      expect(response.status(), `Login for ${email} returned HTTP ${response.status()}`).toBe(200);
      await expect(page).toHaveURL(/\/dashboard$/);
      cookies = await context.cookies();
    } catch (error) {
      if (sessionRequests.length) console.error(`Role setup authentication requests: ${sessionRequests.join(', ')}`);
      throw error;
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
