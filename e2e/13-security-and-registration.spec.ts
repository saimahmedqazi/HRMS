import { test, expect } from '@playwright/test';
import { authenticator } from 'otplib';
import { openFixtureDatabase } from './fixture-database';

test.describe('Security & Tenant Registration Lifecycle', () => {
  test.beforeEach(async () => {
    const prisma = openFixtureDatabase();
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
    await prisma.$disconnect();
  });

  test('Authenticator setup stores an encrypted secret and supports TOTP and backup sign-in', async ({ page }) => {
    const prisma = openFixtureDatabase();
    const email = 'ceo@acme.com';
    const password = 'Password@123';
    const signIn = async () => {
      await page.goto('/login');
      await page.locator('input[type="email"]').fill(email);
      await page.locator('input[type="password"]').fill(password);
      const login = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/v1/auth/login');
      await page.locator('button[type="submit"]').click();
      expect((await login).status()).toBe(200);
    };
    const openSecuritySettings = async () => {
      await page.locator('a[href="/dashboard/settings"]').click();
      await page.getByRole('button', { name: 'Security & 2FA' }).click();
    };
    const enterAuthenticatorCode = async (label: string, secret: string) => {
      const input = page.getByLabel(label, { exact: true });
      await expect(input).toBeVisible();
      await expect.poll(() => authenticator.timeRemaining()).toBeGreaterThan(5);
      await input.fill(authenticator.generate(secret));
    };

    try {
      const original = await prisma.user.findUniqueOrThrow({
        where: { email },
        select: { id: true, twoFaEnabled: true, twoFaSecret: true, twoFaBackupCodes: true },
      });
      const { id, ...originalSetup } = original;
      try {
        await signIn();
        await page.waitForURL('**/dashboard');
        await openSecuritySettings();
        await expect(page.getByText('DISABLED', { exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Configure Two-Factor Authentication' }).click();
        await expect(page.getByRole('img', { name: '2FA QR Code' })).toBeVisible();
        const secret = (await page.locator('code').textContent())!.trim();
        await enterAuthenticatorCode('2. Enter 6-digit verification code', secret);
        await page.getByRole('button', { name: 'Enable', exact: true }).click();

        const recovery = page.getByRole('region', { name: 'Save your backup codes' });
        await expect(recovery.locator('code')).toHaveCount(8);
        const backup = (await recovery.locator('code').first().textContent())!.trim();
        const stored = await prisma.user.findUniqueOrThrow({ where: { id } });
        expect(stored.twoFaSecret?.startsWith('totp:v1:')).toBe(true);
        expect(stored.twoFaBackupCodes).toHaveLength(8);
        expect(stored.twoFaBackupCodes.includes(backup)).toBe(false);
        const repeatSetup = await page.request.post('/api/v1/auth/2fa/generate');
        expect(repeatSetup.status()).toBe(409);

        await recovery.getByRole('button', { name: 'Done' }).click();
        await expect(recovery).toBeHidden();
        await page.locator('button[title="Sign out"]').click();
        await page.waitForURL('**/login');
        await signIn();
        await enterAuthenticatorCode('Verification Code', secret);
        await page.getByRole('button', { name: 'Verify Code' }).click();
        await expect(page).toHaveURL(/\/dashboard$/);

        await page.locator('button[title="Sign out"]').click();
        await page.waitForURL('**/login');
        await signIn();
        await page.getByLabel('Verification Code').fill(backup);
        await page.getByRole('button', { name: 'Verify Code' }).click();
        await expect(page).toHaveURL(/\/dashboard$/);
        expect((await prisma.user.findUniqueOrThrow({ where: { id } })).twoFaBackupCodes).toHaveLength(7);

        await openSecuritySettings();
        await page.getByLabel('Confirm your password to disable 2FA').fill(password);
        await page.getByRole('button', { name: 'Disable 2FA' }).click();
        await expect(page.getByText('DISABLED', { exact: true })).toBeVisible();
      } finally {
        await prisma.user.update({ where: { id }, data: originalSetup });
      }
    } finally {
      await prisma.$disconnect();
    }
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
