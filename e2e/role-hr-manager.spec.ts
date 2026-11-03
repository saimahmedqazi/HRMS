import { test, expect } from '@playwright/test';
import * as path from 'path';

test.describe('Role 4: HR Manager Comprehensive Test Suite (10 Tests)', () => {
  const screenshotsDir = path.join(process.cwd(), 'e2e', 'screenshots');

  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/login');
    await page.fill('input[type="email"]', 'hr@acme.com');
    await page.fill('input[type="password"]', 'Password@123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 });
  });

  test('HR-01: HR Operations Hub displays workforce metrics and operational KPIs', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('HR Operations Hub');
    await expect(page.locator('text=Active Workforce')).toBeVisible();
    await expect(page.locator('text=On-Probation Staff')).toBeVisible();
    await expect(page.getByText('Exceptions Queue', { exact: true })).toBeVisible();
    await expect(page.locator('text=Pending Leave Approvals')).toBeVisible();

    await expect(page.locator('a:has-text("Execute Monthly Payroll")')).toBeVisible();

    await page.screenshot({ path: path.join(screenshotsDir, 'hr-01-dashboard.png'), fullPage: true });
  });

  test('HR-02: Workforce Directory & Employee Profiles Inspection', async ({ page }) => {
    await page.click('a[href="/dashboard/employees"]');
    await page.waitForURL('**/dashboard/employees', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Employee Directory');

    // Inspect search bar and employee profile cards
    await expect(page.locator('input[placeholder*="Search"]')).toBeVisible();
    const employeeCards = page.locator('a[href*="/dashboard/employees/"]');
    await expect(employeeCards.first()).toBeVisible();

    await page.screenshot({ path: path.join(screenshotsDir, 'hr-02-employees.png'), fullPage: true });
  });

  test('HR-03: Bulk Employee Import Hub: Download Excel Template (.xlsx)', async ({ page }) => {
    await page.click('a[href="/dashboard/bulk-import"]');
    await page.waitForURL('**/dashboard/bulk-import', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Bulk Employee Import');

    // Download template button and schema guidance
    await expect(page.locator('button:has-text("Download Sample Template"), a:has-text("Download")')).toBeVisible();
    await expect(page.locator('text=.xlsx').first()).toBeVisible();

    await page.screenshot({ path: path.join(screenshotsDir, 'hr-03-bulk-import.png'), fullPage: true });
  });

  test('HR-04: Attendance Exceptions Queue: Review exception categories', async ({ page }) => {
    await page.goto('/dashboard/attendance/exceptions');
    await page.waitForURL('**/dashboard/attendance/exceptions', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('HR Exceptions Queue');

    // Table or empty state should be visible
    const queueCard = page.locator('div.rounded-xl.border');
    await expect(queueCard.first()).toBeVisible();

    await page.screenshot({ path: path.join(screenshotsDir, 'hr-04-attendance-exceptions.png'), fullPage: true });
  });

  test('HR-05: Attendance Monitoring & HR IP Whitelist Management', async ({ page }) => {
    await page.click('a[href="/dashboard/attendance"]');
    await page.waitForURL('**/dashboard/attendance', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Attendance & Work Timer');

    // Attendance KPI cards & Graphs
    await expect(page.locator('text=Present (Onsite)').first()).toBeVisible();
    await expect(page.locator('text=Attendance Analytics Graph (Present vs. Absent)')).toBeVisible();

    // HR IP Whitelist management
    await expect(page.locator('text=HR IP Whitelist (Office & Remote / Hybrid WFH Access Control)')).toBeVisible();
    await expect(page.locator('input[placeholder*="IP Address"]')).toBeVisible();

    await page.screenshot({ path: path.join(screenshotsDir, 'hr-05-attendance-whitelist.png') });
  });

  test('HR-06: Leave Approvals Queue: Step 2 HR Final Adjudication View', async ({ page }) => {
    await page.click('a[href="/dashboard/leave-approvals"]');
    await page.waitForURL('**/dashboard/leave-approvals', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Leave Approvals');

    // Tab buttons for Action Required vs All Company Leaves
    await expect(page.locator('button:has-text("Action Required")')).toBeVisible();
    await expect(page.locator('button:has-text("All Company Leaves")')).toBeVisible();

    await page.screenshot({ path: path.join(screenshotsDir, 'hr-06-leave-approvals.png'), fullPage: true });
  });

  test('HR-07: Company Leave Calendar & Quotas Overview', async ({ page }) => {
    await page.click('a[href="/dashboard/leave"]');
    await page.waitForURL('**/dashboard/leave', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Leave Management');

    // Verify leave policy cards
    await expect(page.locator('text=ANNUAL LEAVE')).toBeVisible();
    await expect(page.locator('text=Quota').first()).toBeVisible();

    await page.screenshot({ path: path.join(screenshotsDir, 'hr-07-leave-calendar.png'), fullPage: true });
  });

  test('HR-08: Payroll Management Hub: Headcount, Gross & Statutory Withholdings KPIs', async ({ page }) => {
    await page.click('a[href="/dashboard/payroll"]');
    await page.waitForURL('**/dashboard/payroll', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Payroll Management');

    // KPI Cards
    await expect(page.locator('text=Headcount Processed')).toBeVisible();
    await expect(page.locator('text=Total Gross Payroll')).toBeVisible();
    await expect(page.locator('text=Taxes & Deductions')).toBeVisible();
    await expect(page.locator('text=Net Disbursable')).toBeVisible();

    await page.screenshot({ path: path.join(screenshotsDir, 'hr-08-payroll-kpis.png'), fullPage: true });
  });

  test('HR-09: Payroll Execution Modal & Payslips Table Inspection', async ({ page }) => {
    await page.goto('/dashboard/payroll');
    await page.waitForURL('**/dashboard/payroll');

    // Open execute modal
    await page.click('button:has-text("Execute Payroll Run")');
    await expect(page.locator('h3:has-text("Execute Monthly Payroll")')).toBeVisible();
    await expect(page.locator('text=Month').first()).toBeVisible();

    // Close modal
    await page.click('button:has-text("Cancel")');
    await expect(page.locator('h3:has-text("Execute Monthly Payroll")')).toBeHidden();

    await page.screenshot({ path: path.join(screenshotsDir, 'hr-09-payroll-modal.png') });
  });

  test('HR-10: HR Manager Organization Settings & Security Tab', async ({ page }) => {
    await page.click('a[href="/dashboard/settings"]');
    await page.waitForURL('**/dashboard/settings', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Platform & Tenant Settings');

    // Organization Profile Tab
    await expect(page.locator('text=Organization Profile')).toBeVisible();

    // Switch to Security Tab
    await page.click('button:has-text("Security & 2FA")');
    await expect(page.locator('text=Two-Factor Authentication (TOTP)')).toBeVisible();

    await page.screenshot({ path: path.join(screenshotsDir, 'hr-10-settings-security.png'), fullPage: true });
  });
});
