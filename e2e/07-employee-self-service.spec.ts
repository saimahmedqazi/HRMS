import { test, expect } from '@playwright/test';

test('Mobile navigation contains keyboard focus and returns it when dismissed', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');
  await page.locator('input[type=email]').fill('employee@acme.com');
  await page.locator('input[type=password]').fill('Password@123');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await page.waitForURL('**/dashboard');

  const menuButton = page.getByRole('button', { name: 'Open menu' });
  const drawer = page.getByRole('dialog', { name: 'Dashboard navigation' });
  await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Tab');
  await expect(menuButton).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(drawer.getByRole('button', { name: 'Close menu' })).toBeFocused();
  await expect(drawer.getByRole('link', { name: 'My Attendance' })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(drawer.getByRole('link', { name: 'Dashboard', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(drawer.getByRole('button', { name: 'Close menu' })).toBeFocused();
  const backgroundMenu = page.locator('header button[aria-controls="mobile-dashboard-navigation"]');
  await backgroundMenu.evaluate((button: HTMLButtonElement) => button.focus());
  await expect(drawer.getByRole('button', { name: 'Close menu' })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(menuButton).toBeFocused();
  await expect(menuButton).toHaveAttribute('aria-expanded', 'false');

  await menuButton.click();
  await drawer.getByRole('link', { name: 'My Attendance' }).click();
  await expect(page).toHaveURL(/\/dashboard\/my-attendance$/);
  await expect(drawer).toBeHidden();
});

test.describe('Employee Self-Service & Tier Gating Suite', () => {
  test('Regular Employee: Workplace, My Attendance, My Leave, My Payslips, Work Timer, and Profile with Login IP Telemetry', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/login');
    await page.fill('input[type="email"]', 'employee@acme.com');
    await page.fill('input[type="password"]', 'Password@123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 });

    // 1. My Workplace Dashboard
    await expect(page.locator('h1')).toContainText('My Workplace');
    await expect(page.locator('text=Today\'s Attendance')).toBeVisible();
    await expect(page.getByRole('main').getByText('Work Timer', { exact: true })).toBeVisible();
    await expect(page.getByText('Leave Balances', { exact: true })).toBeVisible();
    await expect(page.locator('text=Latest Payslip')).toBeVisible();

    // 2. My Attendance
    await page.click('a[href="/dashboard/my-attendance"]');
    await page.waitForURL('**/dashboard/my-attendance');
    await expect(page.locator('h1')).toContainText('Attendance & Work Timer');
    await expect(page.getByRole('heading', { name: 'Daily Punch' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Monthly Attendance Calendar' })).toBeVisible();

    // 3. My Leave
    await page.click('a[href="/dashboard/my-leave"]');
    await page.waitForURL('**/dashboard/my-leave');
    await expect(page.locator('h1')).toContainText('Leave Management');
    await expect(page.locator('text=Request Leave')).toBeVisible();

    // 4. My Payslips
    await page.click('a[href="/dashboard/my-payslips"]');
    await page.waitForURL('**/dashboard/my-payslips');
    await expect(page.locator('h1')).toContainText('My Payslips');

    // 5. Work Timer
    await page.click('a[href="/dashboard/work-timer"]');
    await page.waitForURL('**/dashboard/work-timer');
    await expect(page.locator('h1')).toContainText('Attendance & Work Timer');
    await expect(page.locator('text=Work Timer (Premium)')).toBeVisible();

    // 6. My Profile (with Login IP & Geolocation Telemetry)
    await page.goto('/dashboard/my-profile');
    // For employee, it redirects to /dashboard/employees/[id]
    await page.waitForURL('**/dashboard/employees/*', { timeout: 10000 });
    await expect(page.locator('text=Last Login IP & Geolocation Telemetry')).toBeVisible();
    await expect(page.locator('text=Logged in from IP')).toBeVisible();
    await expect(page.locator('text=Login IP Address')).toBeVisible();
    await expect(page.locator('text=Latitude & Longitude')).toBeVisible();
  });

  test('Basic Tier Tenant Admin: verify Basic Plan limits and feature gating', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/login');
    await page.fill('input[type="email"]', 'ceo@globex.com');
    await page.fill('input[type="password"]', 'Password@123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 });

    // Navigate to Billing
    await page.click('a[href="/dashboard/billing"]');
    await page.waitForURL('**/dashboard/billing');

    // Verify BASIC PLAN status and upgrade prompt
    await expect(page.getByText('BASIC PLAN', { exact: true })).toBeVisible();
    await expect(page.locator('button:has-text("Upgrade to Premium")')).toBeVisible();
    await expect(page.locator('text=Up to 25 Employees')).toBeVisible();
    await expect(page.locator('text=Locked').first()).toBeVisible();

    await page.route('**/api/v1/subscriptions/checkout-session', (route) => route.fulfill({
      status: 200,
      json: { url: 'http://localhost:3000/dashboard/billing', mode: 'sandbox' },
    }));
    await page.getByRole('button', { name: /Upgrade to Premium/ }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Stripe is simulated in this local demo' })).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard\/billing$/);
    await expect(page.getByText('BASIC PLAN', { exact: true })).toBeVisible();

    await page.route('**/api/v1/subscriptions/portal-session', (route) => route.fulfill({
      status: 503,
      json: { message: 'The Stripe billing portal is unavailable. Contact your platform administrator.' },
    }));
    await page.getByRole('button', { name: 'Billing Portal' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'The Stripe billing portal is unavailable' })).toBeVisible();
    await expect(page.getByText('Stripe is simulated in this local demo', { exact: false })).toBeHidden();
  });
});
