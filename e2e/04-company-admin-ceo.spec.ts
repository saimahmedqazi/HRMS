import { test, expect } from '@playwright/test';

test.describe('Company Admin (CEO) End-to-End Suite', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/login');
    await page.fill('input[type="email"]', 'ceo@acme.com');
    await page.fill('input[type="password"]', 'Password@123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 });
  });

  test('Executive Dashboard displays KPIs and workforce analytics charts', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Executive Dashboard');

    // 4 KPI Cards
    await expect(page.locator('text=Total Employees')).toBeVisible();
    await expect(page.locator('text=Present Today')).toBeVisible();
    await expect(page.locator('text=Pending Approvals')).toBeVisible();
    await expect(page.locator('text=Attendance Exceptions')).toBeVisible();

    // Recharts Visualizations
    await expect(page.locator('text=7-Day Workforce Attendance Trend')).toBeVisible();
    await expect(page.locator('text=Department Headcount Distribution')).toBeVisible();
  });

  test('Employees directory and employee detail page with Login IP & Geolocation Telemetry', async ({ page }) => {
    await page.click('a[href="/dashboard/employees"]');
    await page.waitForURL('**/dashboard/employees');
    await expect(page.locator('h1')).toContainText('Employee Directory');

    // Find and click on an employee record (e.g. Arthur Pendelton or Hannah Ross)
    const employeeCard = page.locator('a[href*="/dashboard/employees/"]').first();
    await expect(employeeCard).toBeVisible();
    await employeeCard.click();

    // Verify Employee Detail page
    await page.waitForURL('**/dashboard/employees/*', { timeout: 10000 });
    await expect(page.locator('text=Job Details')).toBeVisible();
    await expect(page.locator('text=Personal Demographics')).toBeVisible();

    // Verify Audited Login IP & Geolocation Telemetry card
    await expect(page.locator('text=Last Login IP & Geolocation Telemetry')).toBeVisible();
    await expect(page.locator('text=Logged in from IP')).toBeVisible();
    await expect(page.locator('text=Login IP Address')).toBeVisible();
    await expect(page.locator('text=Latitude & Longitude')).toBeVisible();
    await expect(page.locator('text=Login Date & Time')).toBeVisible();
  });

  test('Departments page displays company departments', async ({ page }) => {
    await page.click('a[href="/dashboard/departments"]');
    await page.waitForURL('**/dashboard/departments');
    await expect(page.locator('h1')).toContainText('Organization Structure');
    await expect(page.locator('text=Engineering').first()).toBeVisible();
    await expect(page.locator('text=Human Resources').first()).toBeVisible();
  });

  test('Attendance page features complete Punch, Work Timer, Analytics Graph, Calendar, and HR IP Whitelist', async ({ page }) => {
    await page.click('a[href="/dashboard/attendance"]');
    await page.waitForURL('**/dashboard/attendance');
    await expect(page.locator('h1')).toContainText('Attendance & Work Timer');

    // 4 Attendance KPI Summary Cards
    await expect(page.locator('text=Present (Onsite)').first()).toBeVisible();
    await expect(page.locator('text=Present (Remote)').first()).toBeVisible();
    await expect(page.locator('text=Absent Count').first()).toBeVisible();
    await expect(page.locator('text=Exceptions / Pending').first()).toBeVisible();

    // Punch and Work Timer cards
    await expect(page.getByRole('heading', { name: 'Daily Punch' })).toBeVisible();
    await expect(page.locator('text=Work Timer (Premium)')).toBeVisible();

    // Network IP and Lat/Long coordinates telemetry banner
    await expect(page.locator('text=IP:').first()).toBeVisible();
    await expect(page.locator('text=Lat/Long:').first()).toBeVisible();

    // Attendance Analytics Graph (Present vs. Absent)
    await expect(page.locator('text=Attendance Analytics Graph (Present vs. Absent)')).toBeVisible();

    // Monthly Attendance Calendar Grid
    await expect(page.getByRole('heading', { name: 'Monthly Attendance Calendar' })).toBeVisible();
    await expect(page.getByText('Sun', { exact: true })).toBeVisible();
    await expect(page.getByText('Mon', { exact: true })).toBeVisible();
    await expect(page.getByText('Sat', { exact: true })).toBeVisible();

    // HR IP Whitelist (Office & Remote / Hybrid WFH Access Control) panel
    await expect(page.locator('text=HR IP Whitelist (Office & Remote / Hybrid WFH Access Control)')).toBeVisible();
    await expect(page.locator('input[placeholder*="IP Address"]')).toBeVisible();

    // Test adding an IP to whitelist
    await page.fill('input[placeholder*="IP Address"]', '192.168.1.100');
    await page.fill('input[placeholder*="Label"]', 'E2E Test Hybrid Office Router');
    await page.click('button:has-text("Add IP to Whitelist")');

    // Wait for the added IP to appear in the table
    await expect(page.locator('text=192.168.1.100')).toBeVisible({ timeout: 10000 });
  });

  test('Billing page displays Active Tier, Billing Dates, and Stripe credentials', async ({ page }) => {
    await page.click('a[href="/dashboard/billing"]');
    await page.waitForURL('**/dashboard/billing');
    await expect(page.locator('h1')).toContainText('Billing & Subscription Plans');

    // Active Tier Badge
    await expect(page.locator('text=PREMIUM PLAN')).toBeVisible();

    // Billing Cycle Start Date & Next Renewal Date
    await expect(page.locator('text=Billing Cycle Start Date')).toBeVisible();
    await expect(page.locator('text=Next Billing / Renewal Date')).toBeVisible();
    await expect(page.locator('text=$149.00 USD / month')).toBeVisible();

    // Stripe Billing Portal button
    await expect(page.locator('button:has-text("Billing Portal")')).toBeVisible();
  });

  test('Settings page updates Organization Profile and Leave Policies', async ({ page }) => {
    await page.click('a[href="/dashboard/settings"]');
    await page.waitForURL('**/dashboard/settings');
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
  });
});
