import { test, expect } from '@playwright/test';
import { useRoleSession } from './role-session';

test.describe('Operation Manager End-to-End Suite', () => {
  useRoleSession('ops@zenhr.com', 'Password@123');

  test('Operation Manager Dashboard displays platform graphs and billing dates table', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Operations Command Center');

    // Platform KPIs and Graphs
    await expect(page.locator('text=Total Tenants')).toBeVisible();
    await expect(page.locator('text=Estimated MRR')).toBeVisible();
    await expect(page.locator('text=Subscription Tier & Tenant Status Distribution')).toBeVisible();

    // Client Subscription Billing Dates Table
    await expect(page.locator('text=Client Subscription Billing & Renewal Dates')).toBeVisible();
    await expect(page.locator('table')).toContainText('Acme Corporation');
  });

  test('Operation Manager can view Companies and Resource Requests', async ({ page }) => {
    // Navigate to Companies
    await page.click('a[href="/dashboard/companies"]');
    await page.waitForURL('**/dashboard/companies');
    await expect(page.locator('h1')).toContainText('Client Organizations');
    await expect(page.locator('text=Acme Corporation').first()).toBeVisible();

    // Navigate to Resource Requests
    await page.click('a[href="/dashboard/resources"]');
    await page.waitForURL('**/dashboard/resources');
    await expect(page.locator('h1')).toContainText('Resource Requests');
  });

  test('Operation Manager Billing page shows all tenant subscriptions', async ({ page }) => {
    await page.goto('/dashboard/billing');
    await expect(page.locator('h1')).toContainText('Billing & Subscription Plans');
    await expect(page.locator('text=Platform Tenant Subscriptions & Billing Dates')).toBeVisible();
  });
});
