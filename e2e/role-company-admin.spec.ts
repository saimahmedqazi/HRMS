import { test, expect } from '@playwright/test';
import * as path from 'path';

test.describe('Role 3: Company Admin (CEO) Comprehensive Test Suite (10 Tests)', () => {
  const screenshotsDir = path.join(process.cwd(), 'e2e', 'screenshots');

  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/login');
    await page.fill('input[type="email"]', 'ceo@acme.com');
    await page.fill('input[type="password"]', 'Password@123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 });
  });

  test('CA-01: Executive Dashboard displays 4 core KPIs & 7-Day Attendance Trend chart', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Executive Dashboard');
    await expect(page.locator('text=Total Employees')).toBeVisible();
    await expect(page.locator('text=Present Today')).toBeVisible();
    await expect(page.locator('text=Pending Approvals')).toBeVisible();
    await expect(page.locator('text=Attendance Exceptions')).toBeVisible();

    await expect(page.locator('text=7-Day Workforce Attendance Trend')).toBeVisible();
    const chartSvgs = page.locator('.recharts-responsive-container svg');
    await expect(chartSvgs.first()).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: path.join(screenshotsDir, 'ca-01-dashboard.png'), fullPage: true });
  });

  test('CA-02: Workforce Analytics: Department Headcount Distribution chart & metrics', async ({ page }) => {
    await expect(page.locator('text=Department Headcount Distribution')).toBeVisible();
    const chartSvgs = page.locator('.recharts-responsive-container svg');
    await expect(chartSvgs.nth(1)).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: path.join(screenshotsDir, 'ca-02-headcount-chart.png') });
  });

  test('CA-03: Employee Directory search, status filters, and navigation', async ({ page }) => {
    await page.click('a[href="/dashboard/employees"]');
    await page.waitForURL('**/dashboard/employees', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Employee Directory');

    // Verify employee search input and cards
    await expect(page.locator('input[placeholder*="Search"]')).toBeVisible();
    const employeeCards = page.locator('a[href*="/dashboard/employees/"]');
    await expect(employeeCards.first()).toBeVisible();

    await page.screenshot({ path: path.join(screenshotsDir, 'ca-03-employees-directory.png'), fullPage: true });
  });

  test('CA-04: Employee Detail Profile with Audited Login IP & Lat/Long Geolocation Telemetry', async ({ page }) => {
    await page.goto('/dashboard/employees');
    await page.waitForURL('**/dashboard/employees');

    const employeeCard = page.locator('a[href*="/dashboard/employees/"]').first();
    await employeeCard.click();
    await page.waitForURL('**/dashboard/employees/*', { timeout: 10000 });

    await expect(page.locator('text=Job Details')).toBeVisible();
    await expect(page.locator('text=Personal Demographics')).toBeVisible();

    // Verify Audited Login IP & Geolocation Telemetry card
    await expect(page.locator('text=Last Login IP & Geolocation Telemetry')).toBeVisible();
    await expect(page.locator('text=Logged in from IP')).toBeVisible();
    await expect(page.locator('text=Login IP Address')).toBeVisible();
    await expect(page.locator('text=Latitude & Longitude')).toBeVisible();
    await expect(page.locator('text=Login Date & Time')).toBeVisible();

    await page.screenshot({ path: path.join(screenshotsDir, 'ca-04-employee-telemetry.png'), fullPage: true });
  });

  test('CA-05: Department & Designation Organization Structure Hub', async ({ page }) => {
    await page.click('a[href="/dashboard/departments"]');
    await page.waitForURL('**/dashboard/departments', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Organization Structure');
    await expect(page.locator('text=Engineering').first()).toBeVisible();
    await expect(page.locator('text=Human Resources').first()).toBeVisible();

    await page.screenshot({ path: path.join(screenshotsDir, 'ca-05-departments.png'), fullPage: true });
  });

  test('CA-06: Attendance Command Center: Daily Punch, Timer, and Real-Time Telemetry', async ({ page }) => {
    await page.click('a[href="/dashboard/attendance"]');
    await page.waitForURL('**/dashboard/attendance', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Attendance & Work Timer');

    // 4 Attendance KPI Summary Cards
    await expect(page.locator('text=Present (Onsite)').first()).toBeVisible();
    await expect(page.locator('text=Present (Remote)').first()).toBeVisible();
    await expect(page.locator('text=Absent Count').first()).toBeVisible();
    await expect(page.locator('text=Exceptions / Pending').first()).toBeVisible();

    // Daily Punch and Work Timer cards
    await expect(page.getByRole('heading', { name: 'Daily Punch' })).toBeVisible();
    await expect(page.locator('text=Work Timer (Premium)')).toBeVisible();

    // Network IP and Lat/Long coordinates telemetry banner
    await expect(page.locator('text=IP:').first()).toBeVisible();
    await expect(page.locator('text=Lat/Long:').first()).toBeVisible();

    await page.screenshot({ path: path.join(screenshotsDir, 'ca-06-attendance-punch.png') });
  });

  test('CA-07: Attendance Analytics Recharts (Present vs Absent) & Monthly Grid Calendar', async ({ page }) => {
    await page.goto('/dashboard/attendance');
    await page.waitForURL('**/dashboard/attendance');

    // Attendance Analytics Graph (Present vs. Absent)
    await expect(page.locator('text=Attendance Analytics Graph (Present vs. Absent)')).toBeVisible();

    // Monthly Attendance Calendar Grid
    const calendarHeading = page.getByRole('heading', { name: 'Monthly Attendance Calendar' });
    await expect(calendarHeading).toBeVisible();
    const calendar = calendarHeading.locator('xpath=../../..');
    for (const day of ['Sun', 'Mon', 'Sat']) {
      await expect(calendar.getByText(day, { exact: true })).toBeVisible();
    }

    await page.screenshot({ path: path.join(screenshotsDir, 'ca-07-attendance-analytics-calendar.png'), fullPage: true });
  });

  test('CA-08: HR IP Whitelist Configuration (Office & Hybrid WFH Access Control)', async ({ page }) => {
    await page.goto('/dashboard/attendance');
    await page.waitForURL('**/dashboard/attendance');

    await expect(page.locator('text=HR IP Whitelist (Office & Remote / Hybrid WFH Access Control)')).toBeVisible();
    await expect(page.locator('input[placeholder*="IP Address"]')).toBeVisible();

    // Add unique test IP to whitelist
    const testIp = `172.16.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}`;
    await page.fill('input[placeholder*="IP Address"]', testIp);
    await page.fill('input[placeholder*="Label"]', 'E2E Testing Gateway Office');
    await page.click('button:has-text("Add IP to Whitelist")');

    // Verify added IP appears in the whitelist table
    await expect(page.locator(`text=${testIp}`)).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: path.join(screenshotsDir, 'ca-08-ip-whitelist.png') });
  });

  test('CA-09: Billing & Plan Management: Subscription Status, Renewal Dates & Stripe Portal', async ({ page }) => {
    await page.click('a[href="/dashboard/billing"]');
    await page.waitForURL('**/dashboard/billing', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Billing & Subscription Plans');

    // Active Tier Badge
    await expect(page.getByText('PREMIUM PLAN', { exact: true })).toBeVisible();

    // Billing Cycle Start Date & Next Renewal Date
    await expect(page.locator('text=Billing Cycle Start Date')).toBeVisible();
    await expect(page.locator('text=Next Billing / Renewal Date')).toBeVisible();
    await expect(page.locator('text=$149.00 USD / month')).toBeVisible();

    // Stripe Billing Portal button
    await expect(page.locator('button:has-text("Billing Portal")')).toBeVisible();

    await page.screenshot({ path: path.join(screenshotsDir, 'ca-09-billing.png'), fullPage: true });
  });

  test('CA-10: Tenant Settings: Organization Profile & Leave Policies Management', async ({ page }) => {
    await page.click('a[href="/dashboard/settings"]');
    await page.waitForURL('**/dashboard/settings', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Platform & Tenant Settings');

    // Organization Profile Tab
    await expect(page.locator('text=Organization Profile')).toBeVisible();
    await expect(page.locator('text=Tenant Organization Details')).toBeVisible();

    // Save Organization Settings
    await page.click('button:has-text("Save Organization Settings")');
    await expect(page.locator('text=Organization profile settings saved.')).toBeVisible();

    // Leave Policies Tab
    await page.click('button:has-text("Leave Policies")');
    await expect(page.locator('text=Company Leave Quotas & Compliance Rules')).toBeVisible();
    await expect(page.locator('text=CASUAL LEAVE')).toBeVisible();

    await page.screenshot({ path: path.join(screenshotsDir, 'ca-10-settings-leave.png'), fullPage: true });
  });
});
