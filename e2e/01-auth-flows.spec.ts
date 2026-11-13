import { test, expect } from '@playwright/test';

test.describe('Authentication & Access Control Flows', () => {
  test('sign-in explains when the API proxy returns an error page', async ({ page }) => {
    await page.route('**/api/v1/auth/me', (route) => route.fulfill({ status: 401, json: { message: 'Not signed in' } }));
    await page.route('**/api/v1/auth/refresh', (route) => route.fulfill({ status: 401, json: { message: 'Not signed in' } }));
    await page.route('**/api/v1/auth/login', (route) => route.fulfill({
      status: 404, contentType: 'text/plain', body: 'The page could not be found\n\nDNS_HOSTNAME_RESOLVED_PRIVATE',
    }));
    await page.goto('/login');
    await page.locator('input[type="email"]').fill('qa@example.test');
    await page.locator('input[type="password"]').fill('fixture-password');
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page.getByText('The authentication service is unavailable.', { exact: false })).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('a temporarily unavailable session can recover from the dashboard', async ({ page }) => {
    let profileRequests = 0;
    await page.route('**/api/v1/auth/me', (route) => {
      if (++profileRequests === 1) return route.fulfill({ status: 401, json: { message: 'Session expired' } });
      return route.fulfill({ json: { data: { id: 'fixture-hr', role: 'HR_MANAGER', companyId: 'fixture-company' } } });
    });
    await page.route('**/api/v1/auth/refresh', (route) => route.fulfill({ status: 503, json: { message: 'Unavailable' } }));
    await page.route('**/api/v1/auth/me/modules', (route) => route.fulfill({ json: { data: { allowedModules: [] } } }));
    await page.goto('/dashboard');
    await expect(page.getByRole('alert').filter({ hasText: 'We couldn’t check your session.' })).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('sign-in loads a fresh profile while the anonymous profile request is pending', async ({ page }) => {
    let signedIn = false;
    let releaseAnonymous!: () => void;
    const anonymousResponse = new Promise<void>((resolve) => { releaseAnonymous = resolve; });
    await page.route('**/api/v1/auth/me', async (route) => {
      if (!signedIn) {
        await anonymousResponse;
        await route.fulfill({ status: 401, json: { message: 'Not signed in' } }).catch(() => {});
        return;
      }
      await route.fulfill({ json: { data: { id: 'fixture-hr', role: 'HR_MANAGER', companyId: 'fixture-company' } } });
    });
    await page.route('**/api/v1/auth/me/modules', (route) => route.fulfill({ json: { data: { allowedModules: [] } } }));
    await page.route('**/api/v1/auth/login', (route) => {
      signedIn = true;
      return route.fulfill({ json: { data: { user: { id: 'fixture-hr' } } } });
    });

    const initialProfile = page.waitForRequest('**/api/v1/auth/me');
    try {
      await page.goto('/login');
      await initialProfile;
      await page.locator('input[type="email"]').fill('qa@example.test');
      await page.locator('input[type="password"]').fill('fixture-password');
      await page.getByRole('button', { name: 'Sign In', exact: true }).click();
      await expect(page).toHaveURL(/\/dashboard$/, { timeout: 25_000 });
      await expect(page.getByRole('main')).toBeVisible();
    } finally {
      releaseAnonymous();
    }
  });

  test('Login page displays brand, email/password inputs, and navigation links', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveTitle(/ZenHR/i);
    await expect(page.locator('h1')).toContainText('Sign in to ZenHR');

    // Input fields and buttons
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toContainText(/sign in/i);

    // Links to forgot password and registration
    await expect(page.locator('a[href="/forgot-password"]')).toBeVisible();
    await expect(page.locator('a[href="/register"]')).toBeVisible();
  });

  test('Invalid credentials trigger an error message and block access', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'nonexistent@company.com');
    await page.fill('input[type="password"]', 'WrongPassword123!');
    await page.click('button[type="submit"]');

    // Should stay on /login and show error alert
    await expect(page.locator('.text-red-700, .text-red-600, .text-red-400')).toBeVisible();
    expect(page.url()).toContain('/login');
  });

  test('Forgot password page renders correctly', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('Register company page renders correctly', async ({ page }) => {
    await page.goto('/register');
    await expect(page.locator('input[name="companyName"], input[placeholder*="Acme"]')).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('Login and registration show field errors before submitting blank forms', async ({ page }) => {
    await page.goto('/login');
    await page.locator('button[type="submit"]').click();
    await expect(page.getByText('Please enter a valid email address', { exact: true })).toBeVisible();
    await expect(page.getByText('Password is required', { exact: true })).toBeVisible();

    await page.goto('/register');
    await page.locator('button[type="submit"]').click();
    await expect(page.getByText('Company name must be at least 2 characters', { exact: true })).toBeVisible();
    await expect(page.getByText('Password must be at least 8 characters', { exact: true })).toBeVisible();
  });

  test('Registration and password reset explain invalid names and oversized passwords', async ({ page }) => {
    const longPassword = 'é'.repeat(37);
    await page.route('**/api/v1/auth/{me,refresh}', (route) => route.fulfill({ status: 401, json: {} }));
    await page.goto('/register');
    await page.locator('[name="companyName"]').fill('   ');
    await page.locator('[name="adminFirstName"]').fill('  ');
    await page.locator('[name="adminLastName"]').fill('  ');
    await page.locator('[name="adminEmail"]').fill('registration-fixture@example.test');
    await page.locator('[name="adminPassword"]').fill(longPassword);
    await page.getByRole('button', { name: 'Complete Registration' }).click();
    await expect(page.getByText('Company name must be at least 2 characters')).toBeVisible();
    await expect(page.getByText('First name is required')).toBeVisible();
    await expect(page.getByText('Last name is required')).toBeVisible();
    await expect(page.getByText('Password must be at most 72 bytes in UTF-8.')).toBeVisible();

    await page.goto('/reset-password?token=fixture');
    await page.locator('#new-password').fill(longPassword);
    await page.getByRole('button', { name: 'Reset Password' }).click();
    await expect(page.getByText('Password must be at most 72 bytes in UTF-8.')).toBeVisible();
  });

  test('Login and verify dashboard access for all roles', async ({ page }) => {
    const credentials = [
      { email: 'superadmin@zenhr.com', password: 'SuperAdmin@123', expectedHeader: 'Platform Master Console' },
      { email: 'ops@zenhr.com', password: 'Password@123', expectedHeader: 'Operations Command Center' },
      { email: 'ceo@acme.com', password: 'Password@123', expectedHeader: 'Executive Dashboard' },
      { email: 'hr@acme.com', password: 'Password@123', expectedHeader: 'HR Operations Hub' },
      { email: 'eng.manager@acme.com', password: 'Password@123', expectedHeader: 'Department Management Dashboard' },
      { email: 'team.lead@acme.com', password: 'Password@123', expectedHeader: 'Team Squad Command' },
      { email: 'employee@acme.com', password: 'Password@123', expectedHeader: 'My Workplace' },
    ];

    for (const cred of credentials) {
      await page.context().clearCookies();
      if (!page.url().includes('/login')) {
        await page.goto('/login', { waitUntil: 'domcontentloaded' });
      }
      await page.fill('input[type="email"]', cred.email);
      await page.fill('input[type="password"]', cred.password);
      await page.click('button[type="submit"]');

      await page.waitForURL('**/dashboard', { timeout: 15000 });
      await expect(page.locator('main h1, h1')).toContainText(cred.expectedHeader);

      // Verify sign out
      await page.locator('button[title="Sign out"]').click();
      await page.waitForURL('**/login', { timeout: 15000 });
      await page.waitForLoadState('networkidle');
    }
  });
});
