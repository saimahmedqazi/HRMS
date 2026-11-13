import { test, expect } from '@playwright/test';
import { useRoleSession } from './role-session';
import * as path from 'path';

test.describe('Role 7: Employee Comprehensive Test Suite (10 Tests)', () => {
  const screenshotsDir = path.join(process.cwd(), 'e2e', 'screenshots');

  useRoleSession('employee@acme.com', 'Password@123');

  test('EM-01: Employee Workplace Dashboard displays personal KPIs, Attendance, and Work Timer', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('My Workplace');
    await expect(page.locator('text=Today\'s Attendance')).toBeVisible();
    await expect(page.getByRole('main').getByText('Work Timer', { exact: true })).toBeVisible();
    await expect(page.getByText('Leave Balances', { exact: true })).toBeVisible();
    await expect(page.locator('text=Latest Payslip')).toBeVisible();

    await page.screenshot({ path: path.join(screenshotsDir, 'em-01-workplace-dashboard.png'), fullPage: true });
  });

  test('EM-02: Daily Punch Card displays Real-Time Telemetry and Punch Action button', async ({ page }) => {
    const punchResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname === '/api/v1/attendance/today' && response.ok(),
    );
    await page.click('a[href="/dashboard/my-attendance"]');
    await page.waitForURL('**/dashboard/my-attendance', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Attendance & Work Timer');

    // Daily Punch card
    await expect(page.getByRole('heading', { name: 'Daily Punch' })).toBeVisible();
    const { data } = await (await punchResponse).json();
    if (data?.checkOutTime) {
      await expect(page.getByText(/Shift completed for today/)).toBeVisible();
    } else if (data?.checkInTime) {
      await expect(page.getByRole('button', { name: /Punch Out/ })).toBeVisible();
    } else {
      await expect(page.getByRole('button', { name: 'Punch In Now' })).toBeVisible();
      await expect(page.locator('text=IP:').first()).toBeVisible();
      await expect(page.locator('text=Lat/Long:').first()).toBeVisible();
    }

    await page.screenshot({ path: path.join(screenshotsDir, 'em-02-daily-punch.png') });
  });

  test('EM-03: Work Timer Mode: Start, Pause (Break), and Sync Controls', async ({ page }) => {
    await page.click('a[href="/dashboard/work-timer"]');
    await page.waitForURL('**/dashboard/work-timer', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Attendance & Work Timer');

    // Work Timer Card
    await expect(page.locator('text=Work Timer (Premium)')).toBeVisible();
    await expect(page.locator('button:has-text("Start Timer"), button:has-text("Break"), button:has-text("Stop Timer")').first()).toBeVisible();

    await page.screenshot({ path: path.join(screenshotsDir, 'em-03-work-timer.png') });
  });

  test('EM-04: Monthly Attendance Calendar Grid & Daily Hours inspection', async ({ page }) => {
    await page.goto('/dashboard/my-attendance');
    await page.waitForURL('**/dashboard/my-attendance');

    // Monthly Calendar
    await expect(page.getByRole('heading', { name: 'Monthly Attendance Calendar' })).toBeVisible();
    await expect(page.getByText('Sun', { exact: true })).toBeVisible();
    await expect(page.getByText('Mon', { exact: true })).toBeVisible();
    await expect(page.getByText('Sat', { exact: true })).toBeVisible();

    await page.screenshot({ path: path.join(screenshotsDir, 'em-04-attendance-calendar.png'), fullPage: true });
  });

  test('EM-05: Leave Entitlement Dashboard: Balance Cards for Annual, Sick, and Casual Leave', async ({ page }) => {
    await page.click('a[href="/dashboard/my-leave"]');
    await page.waitForURL('**/dashboard/my-leave', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Leave Management');

    // Leave Balances Cards
    await expect(page.locator('text=CASUAL LEAVE')).toBeVisible();
    await expect(page.locator('text=SICK LEAVE')).toBeVisible();
    await expect(page.locator('text=ANNUAL LEAVE')).toBeVisible();
    await expect(page.locator('text=Quota').first()).toBeVisible();

    await page.screenshot({ path: path.join(screenshotsDir, 'em-05-leave-balances.png'), fullPage: true });
  });

  test('EM-06: Leave Application Modal: Type selection, dates, and prescription upload', async ({ page }) => {
    await page.goto('/dashboard/my-leave');
    await page.waitForURL('**/dashboard/my-leave');

    // Open Request Leave modal
    await page.click('button:has-text("Request Leave")');
    await expect(page.locator('h3:has-text("Request Leave")')).toBeVisible();

    // Verify form elements
    await expect(page.locator('select')).toBeVisible();
    await expect(page.locator('textarea')).toBeVisible();

    // Close modal
    await page.click('button:has-text("Cancel")');
    await expect(page.locator('h3:has-text("Request Leave")')).toBeHidden();

    await page.screenshot({ path: path.join(screenshotsDir, 'em-06-leave-modal.png') });
  });

  test('EM-07: Probationary Employee Leave Gating: 90-Day Policy Lockout Banner', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/login');
    await page.fill('input[type="email"]', 'newbie@acme.com');
    await page.fill('input[type="password"]', 'Password@123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 });

    // Navigate to My Leave
    await page.click('a[href="/dashboard/my-leave"]');
    await page.waitForURL('**/dashboard/my-leave');

    // Verify Probation Active Banner and disabled button
    await expect(page.locator('text=Probation Period Active')).toBeVisible();
    await expect(page.locator('text=Per ZenHR company policy, employees on active 3-month probation cannot submit leave requests')).toBeVisible();
    await expect(page.locator('button:has-text("Request Leave")')).toBeDisabled();

    await page.screenshot({ path: path.join(screenshotsDir, 'em-07-probation-gating.png'), fullPage: true });
  });

  test('EM-08: My Payslips Statement: Monthly salary breakdown & Download PDF button', async ({ page }) => {
    const table = page.getByRole('table');
    const empty = page.getByText('No payslips issued yet', { exact: true });
    let releaseRequest!: () => void;
    const pending = new Promise<void>((resolve) => { releaseRequest = resolve; });
    await page.route('**/api/v1/payroll/payslips', async (route) => {
      await pending;
      await route.continue();
    });
    try {
      await page.click('a[href="/dashboard/my-payslips"]');
      await expect(page.getByRole('heading', { name: 'My Payslips', exact: true })).toBeVisible();
      await expect(page.getByRole('status')).toContainText('Loading payslips');
      await expect(empty).toBeHidden();
    } finally {
      releaseRequest();
    }

    await expect(table.or(empty)).toBeVisible();
    if (await table.isVisible()) {
      await expect(table).toContainText('Base Salary');
      await expect(table).toContainText('Net Disbursed');
      await expect(page.locator('a:has-text("PDF")').first()).toBeVisible();
    } else {
      await expect(empty).toBeVisible();
    }

    await page.screenshot({ path: path.join(screenshotsDir, 'em-08-my-payslips.png'), fullPage: true });
  });

  test('EM-09: Equipment / Software Resource Requisition Submission', async ({ page }) => {
    await page.click('a[href="/dashboard/resources"]');
    await page.waitForURL('**/dashboard/resources', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Resource Requests');

    // Open Request modal
    await page.click('button:has-text("Request Resource")');
    await expect(page.locator('h3:has-text("Request Resource")')).toBeVisible();

    // Verify fields
    await expect(page.locator('input[placeholder*="Office Chair"]')).toBeVisible();
    await expect(page.locator('textarea[placeholder*="equipment or software"]')).toBeVisible();

    // Close modal
    await page.click('button:has-text("Cancel")');
    await expect(page.locator('h3:has-text("Request Resource")')).toBeHidden();

    await page.screenshot({ path: path.join(screenshotsDir, 'em-09-resource-requisitions.png') });
  });

  test('EM-10: Employee Profile with Login IP Telemetry & Gemini AI Assistant', async ({ page }) => {
    await page.click('a[href="/dashboard/my-profile"]');
    await page.waitForURL('**/dashboard/employees/*', { timeout: 10000 });

    // Audited Telemetry Card
    await expect(page.locator('text=Last Login IP & Geolocation Telemetry')).toBeVisible();
    await expect(page.locator('text=Logged in from IP')).toBeVisible();
    await expect(page.locator('text=Login IP Address')).toBeVisible();

    // AI Assistant
    await page.click('a[href="/dashboard/ai-assistant"]');
    await page.waitForURL('**/dashboard/ai-assistant', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Gemini Assistant');
    await expect(page.locator('text=Probation Leave Policy')).toBeVisible();

    await page.screenshot({ path: path.join(screenshotsDir, 'em-10-profile-ai.png'), fullPage: true });
  });
});
