import { test, expect } from '@playwright/test';

test.describe('Role 1: Super Admin Comprehensive Test Suite (10 Tests)', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/login');
    await page.fill('input[type="email"]', 'superadmin@zenhr.com');
    await page.fill('input[type="password"]', 'SuperAdmin@123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 });
  });

  test('SA-01: Platform Command Center renders Global Executive KPIs', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Platform Master Console');
    await expect(page.locator('text=Total Tenants').first()).toBeVisible();
    await expect(page.locator('text=Total Accounts').first()).toBeVisible();
    await expect(page.locator('text=Estimated MRR').first()).toBeVisible();
    await expect(page.locator('text=Past Due Invoices').first()).toBeVisible();
    await page.screenshot({ path: 'e2e/screenshots/sa-01-command-center.png', fullPage: true });
  });

  test('SA-02: Interactive Recharts Graphs render for MRR and Tenant Distribution', async ({ page }) => {
    await expect(page.locator('text=Subscription Tier & Tenant Status Distribution')).toBeVisible();
    await expect(page.locator('text=Tenant Workforce & Monthly Subscription Revenue ($)')).toBeVisible();
    await expect(page.locator('.recharts-responsive-container').first()).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'e2e/screenshots/sa-02-recharts-analytics.png' });
  });

  test('SA-03: Platform Subscriptions table displays Next Billing Date and renewal telemetry', async ({ page }) => {
    await expect(page.locator('text=Client Subscription Billing & Renewal Dates')).toBeVisible();
    const billingCol = page.locator('th:has-text("Next Renewal Date")');
    await expect(billingCol).toBeVisible();
    const table = page.locator('table');
    await expect(table).toContainText('Acme Corporation');
    await expect(table).toContainText('PREMIUM');
    await page.screenshot({ path: 'e2e/screenshots/sa-03-subscriptions-table.png' });
  });

  test('SA-04: Companies Directory lists isolated client tenants with Plan badges', async ({ page }) => {
    await page.click('a[href="/dashboard/companies"]');
    await page.waitForURL('**/dashboard/companies');
    await expect(page.locator('h1')).toContainText('Client Organizations');
    await expect(page.locator('text=Acme Corporation').first()).toBeVisible();
    await expect(page.locator('text=PREMIUM').first()).toBeVisible();
    await page.screenshot({ path: 'e2e/screenshots/sa-04-companies-directory.png', fullPage: true });
  });

  test('SA-05: Tenant Company card displays billing cycle and support mode trigger', async ({ page }) => {
    await page.click('a[href="/dashboard/companies"]');
    await page.waitForURL('**/dashboard/companies');
    await expect(page.locator('text=Acme Corporation').first()).toBeVisible();
    const supportModeBtn = page.locator('button:has-text("Support Mode")').first();
    await expect(supportModeBtn).toBeVisible();
    await expect(page.locator('text=Billing Start Date').first()).toBeVisible();
    await expect(page.locator('text=Next Billing Date').first()).toBeVisible();
    await page.screenshot({ path: 'e2e/screenshots/sa-05-tenant-card.png' });
  });

  test('SA-06: Support Mode Workflow assumes tenant context with warning banner and clean return', async ({ page }) => {
    await page.goto('/dashboard/companies');
    await page.waitForLoadState('networkidle');

    // Click Support Mode on Acme Corporation
    const acmeCard = page.locator('div:has-text("Acme Corporation")').filter({ has: page.locator('button:has-text("Support Mode")') }).first();
    await acmeCard.locator('button:has-text("Support Mode")').first().click();

    // Modal appears
    await expect(page.locator('text=1-Hour Time-Limited & Audited Session')).toBeVisible();
    await page.locator('textarea').fill('Investigating ticket #ZEN-UAT-TESTING');
    await page.locator('button:has-text("Assume Workspace")').click();

    // Redirect to dashboard in support mode
    await page.waitForURL('**/dashboard', { timeout: 15000 });
    const banner = page.locator('text=SUPPORT MODE ACTIVE');
    await expect(banner).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'e2e/screenshots/sa-06-support-mode-banner.png', fullPage: true });

    // Exit Support Mode
    const exitBtn = page.locator('button:has-text("Exit Support Mode")');
    await expect(exitBtn).toBeVisible();
    await exitBtn.click();
    await page.waitForURL('**/dashboard/companies', { timeout: 15000 });
    await expect(page.locator('h1')).toContainText('Client Organizations');
  });

  test('SA-07: Platform Billing page presents multi-tenant subscription ledger', async ({ page }) => {
    await page.click('a[href="/dashboard/billing"]');
    await page.waitForURL('**/dashboard/billing');
    await expect(page.locator('h1')).toContainText('Billing & Subscription Plans');
    await expect(page.locator('text=Platform Tenant Subscriptions & Billing Dates')).toBeVisible();
    await expect(page.locator('table')).toContainText('Acme Corporation');
    await page.screenshot({ path: 'e2e/screenshots/sa-07-platform-billing.png', fullPage: true });
  });

  test('SA-08: Platform Governance Settings allows configuring global policies', async ({ page }) => {
    await page.click('a[href="/dashboard/settings"]');
    await page.waitForURL('**/dashboard/settings');
    await expect(page.locator('h1')).toContainText('Platform & Tenant Settings');
    await expect(page.getByRole('button', { name: 'Platform Governance' })).toBeVisible();
    await expect(page.locator('text=Support Mode Session Duration (Hours)')).toBeVisible();
    await expect(page.locator('text=Stripe Dunning Grace Period (Days)')).toBeVisible();
    await expect(page.locator('text=Account Lockout Threshold (Failed Logins)')).toBeVisible();
    await page.screenshot({ path: 'e2e/screenshots/sa-08-platform-governance.png', fullPage: true });
  });

  test('SA-09: Platform Security Tab displays TOTP 2FA configuration options', async ({ page }) => {
    await page.click('a[href="/dashboard/settings"]');
    await page.waitForURL('**/dashboard/settings');
    await page.click('button:has-text("Security & 2FA")');
    await expect(page.locator('text=Two-Factor Authentication (TOTP)')).toBeVisible();
    await expect(page.locator('button:has-text("Configure Two-Factor Authentication")')).toBeVisible();
    await page.screenshot({ path: 'e2e/screenshots/sa-09-sa-security-tab.png' });
  });

  test('SA-10: Super Admin Navigation and Responsive Layout Visual Audit', async ({ page }) => {
    const sidebar = page.locator('nav');
    await expect(sidebar).toBeVisible();
    await expect(sidebar.locator('a[href="/dashboard"]')).toBeVisible();
    await expect(sidebar.locator('a[href="/dashboard/companies"]')).toBeVisible();
    await expect(sidebar.locator('a[href="/dashboard/billing"]')).toBeVisible();
    await expect(sidebar.locator('a[href="/dashboard/settings"]')).toBeVisible();

    // Verify Theme Toggle
    const themeBtn = page.locator('button[title*="Dark"], button[title*="Light"], button:has-text("Dark"), button:has-text("Light")').first();
    if (await themeBtn.isVisible()) {
      await themeBtn.click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: 'e2e/screenshots/sa-10-dark-theme.png' });
      await themeBtn.click();
    }
    await page.screenshot({ path: 'e2e/screenshots/sa-10-navigation-audit.png', fullPage: true });
  });
});
