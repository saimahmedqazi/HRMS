import { test, expect } from '@playwright/test';

test.describe('Super Admin End-to-End Suite', () => {
  test.beforeEach(async ({ page }) => {
    // Login as Super Admin
    await page.context().clearCookies();
    await page.goto('/login');
    await page.fill('input[type="email"]', 'superadmin@zenhr.com');
    await page.fill('input[type="password"]', 'SuperAdmin@123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 });
  });

  test('Super Admin Dashboard displays KPIs, Recharts graphs, and billing dates table', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Platform Master Console');

    // 4 KPI Cards
    await expect(page.locator('text=Total Tenants')).toBeVisible();
    await expect(page.locator('text=Total Accounts')).toBeVisible();
    await expect(page.locator('text=Estimated MRR')).toBeVisible();
    await expect(page.locator('text=Past Due Invoices')).toBeVisible();

    // Recharts Visualizations
    await expect(page.locator('text=Subscription Tier & Tenant Status Distribution')).toBeVisible();
    await expect(page.locator('text=Tenant Workforce & Monthly Subscription Revenue ($)')).toBeVisible();

    // Subscription Billing & Renewal Dates Table
    await expect(page.locator('text=Client Subscription Billing & Renewal Dates')).toBeVisible();
    await expect(page.locator('table')).toBeVisible();
    await expect(page.locator('table')).toContainText('Acme Corporation');
    await expect(page.locator('table')).toContainText('PREMIUM');
    await expect(page.locator('table')).toContainText('$149/mo');
  });

  test('Super Admin Companies page displays organization cards with billing renewal dates', async ({ page }) => {
    await page.click('a[href="/dashboard/companies"]');
    await page.waitForURL('**/dashboard/companies');

    await expect(page.locator('h1')).toContainText('Client Organizations');

    // Filter input
    const searchInput = page.locator('input[placeholder*="Filter companies"]');
    await expect(searchInput).toBeVisible();

    // Verify Acme Corporation card details
    const acmeCard = page.locator('text=Acme Corporation').first();
    await expect(acmeCard).toBeVisible();
    await expect(page.locator('text=PREMIUM ($149/mo)').first()).toBeVisible();
    await expect(page.locator('text=Billing Start Date').first()).toBeVisible();
    await expect(page.locator('text=Next Billing Date').first()).toBeVisible();

    // Verify Support Mode button
    const supportModeBtn = page.locator('button:has-text("Support Mode")').first();
    await expect(supportModeBtn).toBeVisible();
  });

  test('Super Admin Support Mode workflow into Acme Corporation', async ({ page }) => {
    await page.goto('/dashboard/companies');
    await page.waitForLoadState('networkidle');

    // Click Support Mode button on first company
    await page.locator('button:has-text("Support Mode")').first().click();

    // Support mode modal appears
    await expect(page.locator('text=1-Hour Time-Limited & Audited Session')).toBeVisible();
    const reasonInput = page.locator('textarea');
    await reasonInput.fill('Investigating ticket #ZEN-UAT-TESTING');

    // Click Assume Workspace
    await page.locator('button:has-text("Assume Workspace")').click();

    // Wait for redirect to dashboard in support mode
    await page.waitForURL('**/dashboard', { timeout: 15000 });
    // In Support Mode, the executive dashboard of the impersonated tenant is displayed
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Attendance', exact: true })).toBeVisible();
    await expect(page.locator('a[href="/dashboard/payroll"]')).toHaveCount(0);
    await page.goto('/dashboard/attendance/exceptions');
    await expect(page.getByRole('heading', { name: 'HR Exceptions Queue' })).toBeVisible();
    await page.goto('/dashboard/payroll');
    await expect(page.getByRole('heading', { name: 'Access Denied' })).toBeVisible();
  });

  test('Super Admin Billing page displays platform tenant subscriptions', async ({ page }) => {
    await page.goto('/dashboard/billing');
    await expect(page.locator('h1')).toContainText('Billing & Subscription Plans');

    // Table of platform subscriptions
    await expect(page.locator('text=Platform Tenant Subscriptions & Billing Dates')).toBeVisible();
    await expect(page.locator('table')).toContainText('Acme Corporation');
    await expect(page.locator('table')).toContainText('Globex Logistics');
  });

  test('Super Admin Settings page displays Platform Governance and Security tabs', async ({ page }) => {
    await page.goto('/dashboard/settings');
    await expect(page.locator('h1')).toContainText('Platform & Tenant Settings');

    // Platform Governance tab
    await expect(page.getByRole('button', { name: 'Platform Governance' })).toBeVisible();
    await expect(page.locator('text=Support Mode Session Duration (Hours)')).toBeVisible();
    await expect(page.locator('text=Stripe Dunning Grace Period (Days)')).toBeVisible();
    await expect(page.locator('text=Account Lockout Threshold (Failed Logins)')).toBeVisible();

    // Save platform settings button
    await page.locator('button:has-text("Save Platform Settings")').click();
    await expect(page.locator('text=Platform governance policies saved and synchronized.')).toBeVisible();

    // Security & 2FA tab
    await page.locator('button:has-text("Security & 2FA")').click();
    await expect(page.locator('text=Two-Factor Authentication (TOTP)')).toBeVisible();
  });
});
