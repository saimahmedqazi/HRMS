import { test, expect } from '@playwright/test';
import * as path from 'path';

test.describe('Role 2: Operation Manager Comprehensive Test Suite (10 Tests)', () => {
  const screenshotsDir = path.join(process.cwd(), 'e2e', 'screenshots');

  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/login');
    await page.fill('input[type="email"]', 'ops@zenhr.com');
    await page.fill('input[type="password"]', 'Password@123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 });
  });

  test('OM-01: Operations Command Center displays Executive KPIs & System Health', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Operations Command Center');
    await expect(page.locator('text=Total Tenants')).toBeVisible();
    await expect(page.locator('text=Estimated MRR')).toBeVisible();
    await expect(page.locator('text=Past Due Invoices')).toBeVisible();

    await page.screenshot({ path: path.join(screenshotsDir, 'om-01-command-center.png'), fullPage: true });
  });

  test('OM-02: Interactive Recharts Graphs render for MRR and Tenant Distribution', async ({ page }) => {
    await expect(page.locator('text=Subscription Tier & Tenant Status Distribution')).toBeVisible();
    await expect(page.locator('text=Tenant Workforce & Monthly Subscription Revenue ($)')).toBeVisible();

    const chartSvgs = page.locator('.recharts-responsive-container svg');
    await expect(chartSvgs.first()).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: path.join(screenshotsDir, 'om-02-recharts-graphs.png') });
  });

  test('OM-03: Client Subscription Billing & Renewal Dates Table Inspection', async ({ page }) => {
    await expect(page.locator('text=Client Subscription Billing & Renewal Dates')).toBeVisible();
    const table = page.locator('table');
    await expect(table).toContainText('Acme Corporation');
    await expect(table).toContainText('Next Renewal Date');

    await page.screenshot({ path: path.join(screenshotsDir, 'om-03-billing-dates-table.png') });
  });

  test('OM-04: Client Organizations Directory and Tenant Filtering', async ({ page }) => {
    await page.click('a[href="/dashboard/companies"]');
    await page.waitForURL('**/dashboard/companies', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Client Organizations');
    await expect(page.locator('text=Acme Corporation').first()).toBeVisible();

    await page.screenshot({ path: path.join(screenshotsDir, 'om-04-companies-directory.png'), fullPage: true });
  });

  test('OM-05: Resource Requests Hub: Overview & Statistics', async ({ page }) => {
    await page.click('a[href="/dashboard/resources"]');
    await page.waitForURL('**/dashboard/resources', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Resource Requests');
    await expect(page.locator('text=Resource Requisitions')).toBeVisible();

    await page.screenshot({ path: path.join(screenshotsDir, 'om-05-resource-requests.png'), fullPage: true });
  });

  test('OM-06: Resource Requisition Details and Applicant Scoping Inspection', async ({ page }) => {
    await page.goto('/dashboard/resources');
    await page.waitForURL('**/dashboard/resources');

    // Table should be visible
    await expect(page.locator('text=Resource Requisitions')).toBeVisible();

    // Inspect table columns
    const table = page.locator('table');
    await expect(table).toContainText('Applicant');
    await expect(table).toContainText('Department');
    await expect(table).toContainText('Resource');
    await expect(table).toContainText('Status');

    // Verify existing requisitions are listed for Operations Manager oversight
    await expect(page.locator('text=Ergonomic Mechanical Keyboard')).toBeVisible();

    await page.screenshot({ path: path.join(screenshotsDir, 'om-06-requisition-details.png') });
  });

  test('OM-07: Platform Billing & Subscription Ledger View', async ({ page }) => {
    await page.click('a[href="/dashboard/billing"]');
    await page.waitForURL('**/dashboard/billing', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Billing & Subscription Plans');
    await expect(page.locator('text=Platform Tenant Subscriptions & Billing Dates')).toBeVisible();

    await page.screenshot({ path: path.join(screenshotsDir, 'om-07-billing-ledger.png'), fullPage: true });
  });

  test('OM-08: Platform Governance Settings Configuration', async ({ page }) => {
    await page.click('a[href="/dashboard/settings"]');
    await page.waitForURL('**/dashboard/settings', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Platform & Tenant Settings');

    // Platform Governance tab should be active
    await expect(page.locator('text=Support Mode Session Duration')).toBeVisible();
    await expect(page.locator('text=Stripe Dunning Grace Period')).toBeVisible();
    await expect(page.locator('text=Account Lockout Threshold')).toBeVisible();

    await page.screenshot({ path: path.join(screenshotsDir, 'om-08-platform-settings.png'), fullPage: true });
  });

  test('OM-09: Platform Security and TOTP 2FA Privileges', async ({ page }) => {
    await page.goto('/dashboard/settings');
    await page.click('button:has-text("Security & 2FA")');
    await expect(page.locator('text=Two-Factor Authentication (TOTP)')).toBeVisible();

    await page.screenshot({ path: path.join(screenshotsDir, 'om-09-security-totp.png') });
  });

  test('OM-10: Operations Manager Account Profile with Login IP Telemetry Audit', async ({ page }) => {
    await page.click('a[href="/dashboard/my-profile"]');
    await page.waitForURL('**/dashboard/my-profile', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('My Account Profile');
    await expect(page.getByRole('main').getByText('OPERATION MANAGER')).toBeVisible();
    await expect(page.locator('text=Last Login Session & Geolocation Telemetry')).toBeVisible();
    await expect(page.locator('text=VERIFIED SESSION')).toBeVisible();

    await page.screenshot({ path: path.join(screenshotsDir, 'om-10-profile-telemetry.png'), fullPage: true });
  });
});
