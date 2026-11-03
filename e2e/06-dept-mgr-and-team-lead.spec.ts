import { test, expect } from '@playwright/test';

test.describe('Department Manager & Team Lead End-to-End Suite', () => {
  test('Department Manager: Dashboard, Team Members, Dept Payroll, and Leave Approvals', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/login');
    await page.fill('input[type="email"]', 'eng.manager@acme.com');
    await page.fill('input[type="password"]', 'Password@123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 });

    // Dashboard widgets
    await expect(page.locator('h1')).toContainText('Department Management Dashboard');
    await expect(page.locator('text=Department Headcount')).toBeVisible();
    await expect(page.locator('text=Department Leaves')).toBeVisible();
    await expect(page.getByText('Department Payroll', { exact: true })).toBeVisible();

    // Team Members
    await page.click('a[href="/dashboard/team-members"]');
    await page.waitForURL('**/dashboard/team-members');
    await expect(page.locator('h1')).toContainText('Employee Directory');

    // Dept Payroll View
    await page.click('a[href="/dashboard/payroll-view"]');
    await page.waitForURL('**/dashboard/payroll-view');
    await expect(page.locator('h1')).toContainText('Department Payroll Summary');

    // Leave Approvals
    await page.click('a[href="/dashboard/leave-approvals"]');
    await page.waitForURL('**/dashboard/leave-approvals');
    await expect(page.locator('h1')).toContainText('Leave Approvals');
  });

  test('Team Lead: Squad Command, Team Members, and Leave Approvals', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/login');
    await page.fill('input[type="email"]', 'team.lead@acme.com');
    await page.fill('input[type="password"]', 'Password@123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 });

    // Squad Command Dashboard
    await expect(page.locator('h1')).toContainText('Team Squad Command');
    await expect(page.locator('text=Squad Size')).toBeVisible();
    await expect(page.locator('text=Pending Squad Leaves')).toBeVisible();
    await expect(page.locator('text=Break Overstay Alerts')).toBeVisible();

    // Team Members
    await page.click('a[href="/dashboard/team-members"]');
    await page.waitForURL('**/dashboard/team-members');
    await expect(page.locator('h1')).toContainText('Employee Directory');

    // Leave Approvals
    await page.click('a[href="/dashboard/leave-approvals"]');
    await page.waitForURL('**/dashboard/leave-approvals');
    await expect(page.locator('h1')).toContainText('Leave Approvals');
  });
});
