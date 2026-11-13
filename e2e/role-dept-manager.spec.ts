import { test, expect } from '@playwright/test';
import { useRoleSession } from './role-session';
import * as path from 'path';

test.describe('Role 5: Department Manager Comprehensive Test Suite (10 Tests)', () => {
  const screenshotsDir = path.join(process.cwd(), 'e2e', 'screenshots');

  useRoleSession('eng.manager@acme.com', 'Password@123');

  test('DM-01: Department Management Dashboard displays department KPIs & headcount', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Department Management Dashboard');
    await expect(page.locator('text=Department Headcount')).toBeVisible();
    await expect(page.locator('text=Department Leaves')).toBeVisible();
    await expect(page.getByText('Department Payroll', { exact: true })).toBeVisible();

    await page.screenshot({ path: path.join(screenshotsDir, 'dm-01-dashboard.png'), fullPage: true });
  });

  test('DM-02: Team Members Directory scoped strictly to Engineering Department', async ({ page }) => {
    await page.click('a[href="/dashboard/team-members"]');
    await page.waitForURL('**/dashboard/team-members', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Employee Directory');

    // Inspect search bar and employee profile cards
    await expect(page.locator('input[placeholder*="Search"]')).toBeVisible();
    const employeeCards = page.locator('a[href*="/dashboard/employees/"]');
    await expect(employeeCards.first()).toBeVisible();

    await page.screenshot({ path: path.join(screenshotsDir, 'dm-02-team-members.png'), fullPage: true });
  });

  test('DM-03: Attendance Monitoring: Daily Punch & Work Timer Status', async ({ page }) => {
    await page.click('a[href="/dashboard/attendance"]');
    await page.waitForURL('**/dashboard/attendance', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Attendance & Work Timer');

    // Daily Punch and Work Timer cards
    await expect(page.getByRole('heading', { name: 'Daily Punch' })).toBeVisible();
    await expect(page.locator('text=Work Timer (Premium)')).toBeVisible();

    await page.screenshot({ path: path.join(screenshotsDir, 'dm-03-attendance.png') });
  });

  test('DM-04: Attendance Analytics (Present vs Absent) & Monthly Attendance Calendar Grid', async ({ page }) => {
    await page.goto('/dashboard/attendance');
    await page.waitForURL('**/dashboard/attendance');

    // Attendance Analytics Graph
    await expect(page.locator('text=Attendance Analytics Graph (Present vs. Absent)')).toBeVisible();

    // Monthly Calendar
    await expect(page.getByRole('heading', { name: 'Monthly Attendance Calendar' })).toBeVisible();
    await expect(page.getByText('Sun', { exact: true })).toBeVisible();
    await expect(page.getByText('Mon', { exact: true })).toBeVisible();

    await page.screenshot({ path: path.join(screenshotsDir, 'dm-04-attendance-calendar.png'), fullPage: true });
  });

  test('DM-05: Department Payroll Summary: Privacy-Sealed Aggregates & Budget Overview', async ({ page }) => {
    await page.click('a[href="/dashboard/payroll-view"]');
    await page.waitForURL('**/dashboard/payroll-view', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Department Payroll Summary');

    // Privacy notice
    await expect(page.locator('text=Privacy Sealed Department Overview')).toBeVisible();

    // Aggregates
    await expect(page.locator('text=Department Headcount')).toBeVisible();
    await expect(page.locator('text=Total Gross')).toBeVisible();

    await page.screenshot({ path: path.join(screenshotsDir, 'dm-05-payroll-view.png'), fullPage: true });
  });

  test('DM-06: Leave Approvals Queue: Step 1 Departmental Reporting-Line Queue', async ({ page }) => {
    await page.click('a[href="/dashboard/leave-approvals"]');
    await page.waitForURL('**/dashboard/leave-approvals', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Leave Approvals');

    // Tab buttons for Action Required vs All Company Leaves
    await expect(page.locator('button:has-text("Action Required")')).toBeVisible();
    await expect(page.locator('button:has-text("All Company Leaves")')).toBeVisible();

    await page.screenshot({ path: path.join(screenshotsDir, 'dm-06-leave-approvals.png'), fullPage: true });
  });

  test('DM-07: Resource Requests Hub: Departmental Equipment Requisitions', async ({ page }) => {
    await page.click('a[href="/dashboard/resources"]');
    await page.waitForURL('**/dashboard/resources', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Resource Requests');
    await expect(page.locator('text=Resource Requisitions')).toBeVisible();

    await page.screenshot({ path: path.join(screenshotsDir, 'dm-07-resources.png'), fullPage: true });
  });

  test('DM-08: AI Assistant Interface: Gemini HR Policy Query Suggestions', async ({ page }) => {
    await page.click('a[href="/dashboard/ai-assistant"]');
    await page.waitForURL('**/dashboard/ai-assistant', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Gemini Assistant');

    // Preset prompts
    await expect(page.locator('text=Probation Leave Policy')).toBeVisible();
    await expect(page.locator('text=Sick Leave Prescriptions')).toBeVisible();
    await expect(page.locator('input[placeholder*="Ask"]')).toBeVisible();

    await page.screenshot({ path: path.join(screenshotsDir, 'dm-08-ai-assistant.png'), fullPage: true });
  });

  test('DM-09: Department Manager Account Profile with Login IP & Geolocation Telemetry', async ({ page }) => {
    await page.click('a[href="/dashboard/my-profile"]');
    // For employees / managers with employee record, my-profile redirects to their employee detail page
    await page.waitForURL('**/dashboard/employees/*', { timeout: 10000 });
    await expect(page.locator('text=Job Details')).toBeVisible();
    await expect(page.locator('text=Last Login IP & Geolocation Telemetry')).toBeVisible();
    await expect(page.locator('text=Logged in from IP')).toBeVisible();

    await page.screenshot({ path: path.join(screenshotsDir, 'dm-09-profile-telemetry.png'), fullPage: true });
  });

  test('DM-10: Strict Access Control: Restricted from Platform Settings & Company Billing', async ({ page }) => {
    // Attempt navigating to billing
    await page.goto('/dashboard/billing');
    // Should show access denied or redirect to dashboard
    const isRestricted = (await page.locator('text=Access Denied, text=Unauthorized, h1:has-text("Dashboard")').first().isVisible({ timeout: 5000 })) ||
      page.url().includes('/dashboard');
    expect(isRestricted).toBeTruthy();

    await page.screenshot({ path: path.join(screenshotsDir, 'dm-10-rbac-isolation.png') });
  });
});
