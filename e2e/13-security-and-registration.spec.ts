import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

test.describe('Security & Tenant Registration Lifecycle', () => {
  const prisma = new PrismaClient();

  test.beforeEach(async () => {
    // Clean up any previous test tenant records
    const testUser = await prisma.user.findUnique({
      where: { email: 'peter.gibbons@initech-corp.com' },
    });
    if (testUser) {
      if (testUser.companyId) {
        await prisma.company.delete({
          where: { id: testUser.companyId },
        }).catch(() => {});
      } else {
        await prisma.user.delete({
          where: { id: testUser.id },
        }).catch(() => {});
      }
    }
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test('Settings 2FA Secret & QR Code Generation', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/login');
    await page.fill('input[type="email"]', 'ceo@acme.com');
    await page.fill('input[type="password"]', 'Password@123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 });

    await page.click('a[href="/dashboard/settings"]');
    await page.waitForURL('**/dashboard/settings');

    // Click Security & 2FA tab
    await page.click('button:has-text("Security & 2FA")');

    // Verify 2FA status badge
    await expect(page.locator('text=Two-Factor Authentication (TOTP)')).toBeVisible();
    await expect(page.locator('text=DISABLED')).toBeVisible();

    // Click Configure Two-Factor Authentication
    const configBtn = page.locator('button:has-text("Configure Two-Factor Authentication")');
    await expect(configBtn).toBeVisible();
    await configBtn.click();

    // Verify QR Code image is generated and rendered
    const qrImage = page.locator('img[alt="2FA QR Code"]');
    await expect(qrImage).toBeVisible({ timeout: 10000 });

    // Verify secret code block is rendered
    await expect(page.locator('code')).toBeVisible();

    // Verify 6-digit input is available
    await expect(page.locator('input[placeholder="123456"]')).toBeVisible();
  });

  test('New Tenant Self-Service Registration & Isolated Workspace Login', async ({ page }) => {
    const timestamp = Date.now();
    const testCompanyName = `Initech Dynamics ${timestamp}`;
    const testEmail = `peter.gibbons.${timestamp}@initech-corp.com`;

    await page.context().clearCookies();
    await page.goto('/register');

    await expect(page.getByRole('heading', { name: 'Register your Organization' })).toBeVisible();

    // Fill in registration form
    await page.fill('input[placeholder="e.g. Acme Technologies"]', testCompanyName);
    await page.fill('input[placeholder="John"]', 'Peter');
    await page.fill('input[placeholder="Doe"]', 'Gibbons');
    await page.fill('input[placeholder="admin@company.com"]', testEmail);
    await page.fill('input[placeholder="••••••••"]', 'Password@123');

    // Submit registration
    await page.click('button:has-text("Complete Registration")');

    // Verify redirect to dashboard
    await page.waitForURL('**/dashboard', { timeout: 20000 });
    await expect(page.locator('text=Peter').first()).toBeVisible({ timeout: 10000 });

    // Sign out to verify persistent login
    await page.locator('button[title="Sign out"]').click();
    await page.waitForURL('**/login', { timeout: 15000 });

    // Sign back in with new tenant credentials
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', 'Password@123');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/dashboard', { timeout: 15000 });
    await expect(page.locator('text=Peter').first()).toBeVisible();
  });
});
