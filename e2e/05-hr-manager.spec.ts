import { test, expect } from '@playwright/test';

test.describe('HR Manager End-to-End Suite', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/login');
    await page.fill('input[type="email"]', 'hr@acme.com');
    await page.fill('input[type="password"]', 'Password@123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 });
  });

  test('HR Operations Hub displays HR-scoped operational metrics', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('HR Operations Hub');

    // HR KPIs
    await expect(page.locator('text=Active Workforce')).toBeVisible();
    await expect(page.locator('text=On-Probation Staff')).toBeVisible();
    await expect(page.getByText('Exceptions Queue', { exact: true })).toBeVisible();
    await expect(page.locator('text=Pending Leave Approvals')).toBeVisible();

    // Action button to execute payroll
    await expect(page.locator('a:has-text("Execute Monthly Payroll")')).toBeVisible();
  });

  test('HR Manager can access Bulk Import and download Excel template', async ({ page }) => {
    await page.click('a[href="/dashboard/bulk-import"]');
    await page.waitForURL('**/dashboard/bulk-import');
    await expect(page.locator('h1')).toContainText('Bulk Employee Import');

    // Download template button and upload dropzone
    await expect(page.locator('button:has-text("Download Sample Template"), a:has-text("Download")')).toBeVisible();
    await expect(page.locator('text=.xlsx').first()).toBeVisible();
  });

  test('HR Manager can access Attendance Exceptions Queue', async ({ page }) => {
    await page.goto('/dashboard/attendance/exceptions');
    await expect(page.locator('h1')).toContainText('HR Exceptions Queue');
  });

  test('HR Manager can access Leave Approvals and Payroll', async ({ page }) => {
    await page.click('a[href="/dashboard/leave-approvals"]');
    await page.waitForURL('**/dashboard/leave-approvals');
    await expect(page.locator('h1')).toContainText('Leave Approvals');

    await page.click('a[href="/dashboard/payroll"]');
    await page.waitForURL('**/dashboard/payroll');
    await expect(page.locator('h1')).toContainText('Payroll Management');
  });
});
