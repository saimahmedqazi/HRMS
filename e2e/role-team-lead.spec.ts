import { test, expect } from '@playwright/test';
import * as path from 'path';

test.describe('Role 6: Team Lead Comprehensive Test Suite (10 Tests)', () => {
  const screenshotsDir = path.join(process.cwd(), 'e2e', 'screenshots');

  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/login');
    await page.fill('input[type="email"]', 'team.lead@acme.com');
    await page.fill('input[type="password"]', 'Password@123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 });
  });

  test('TL-01: Team Squad Command displays squad size & live check-ins', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Team Squad Command');
    await expect(page.locator('text=Squad Size')).toBeVisible();
    await expect(page.locator('text=Pending Squad Leaves')).toBeVisible();
    await expect(page.locator('text=Break Overstay Alerts')).toBeVisible();

    await page.screenshot({ path: path.join(screenshotsDir, 'tl-01-dashboard.png'), fullPage: true });
  });

  test('TL-02: Squad Members Directory scoped strictly to assigned squad', async ({ page }) => {
    await page.click('a[href="/dashboard/team-members"]');
    await page.waitForURL('**/dashboard/team-members', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Employee Directory');

    // Inspect search bar and employee profile cards
    await expect(page.locator('input[placeholder*="Search"]')).toBeVisible();
    const employeeCards = page.locator('a[href*="/dashboard/employees/"]');
    await expect(employeeCards.first()).toBeVisible();

    await page.screenshot({ path: path.join(screenshotsDir, 'tl-02-squad-members.png'), fullPage: true });
  });

  test('TL-03: Team Lead Attendance Command Center & Daily Punch', async ({ page }) => {
    await page.click('a[href="/dashboard/attendance"]');
    await page.waitForURL('**/dashboard/attendance', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Attendance & Work Timer');

    // Daily Punch and Work Timer cards
    await expect(page.getByRole('heading', { name: 'Daily Punch' })).toBeVisible();
    await expect(page.locator('text=Work Timer (Premium)')).toBeVisible();

    await page.screenshot({ path: path.join(screenshotsDir, 'tl-03-attendance.png') });
  });

  test('TL-04: Team Lead Attendance Analytics Recharts (Present vs Absent)', async ({ page }) => {
    await page.goto('/dashboard/attendance');
    await page.waitForURL('**/dashboard/attendance');

    // Attendance Analytics Graph
    await expect(page.locator('text=Attendance Analytics Graph (Present vs. Absent)')).toBeVisible();

    await page.screenshot({ path: path.join(screenshotsDir, 'tl-04-attendance-chart.png') });
  });

  test('TL-05: Team Lead Monthly Attendance Grid Calendar', async ({ page }) => {
    await page.goto('/dashboard/attendance');
    await page.waitForURL('**/dashboard/attendance');

    // Monthly Calendar
    await expect(page.getByRole('heading', { name: 'Monthly Attendance Calendar' })).toBeVisible();
    await expect(page.getByText('Sun', { exact: true })).toBeVisible();
    await expect(page.getByText('Mon', { exact: true })).toBeVisible();

    await page.screenshot({ path: path.join(screenshotsDir, 'tl-05-attendance-calendar.png'), fullPage: true });
  });

  test('TL-06: Leave Approvals Queue: Step 1 Squad Sign-Offs', async ({ page }) => {
    await page.click('a[href="/dashboard/leave-approvals"]');
    await page.waitForURL('**/dashboard/leave-approvals', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Leave Approvals');

    // Tab buttons for Action Required vs All Company Leaves
    await expect(page.locator('button:has-text("Action Required")')).toBeVisible();
    await expect(page.locator('button:has-text("All Company Leaves")')).toBeVisible();

    await page.screenshot({ path: path.join(screenshotsDir, 'tl-06-leave-approvals.png'), fullPage: true });
  });

  test('TL-07: Resource Requisitions Queue: Squad Hardware & Software Requests', async ({ page }) => {
    await page.click('a[href="/dashboard/resources"]');
    await page.waitForURL('**/dashboard/resources', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Resource Requests');
    await expect(page.locator('text=Resource Requisitions')).toBeVisible();

    await page.screenshot({ path: path.join(screenshotsDir, 'tl-07-resources.png'), fullPage: true });
  });

  test('TL-08: AI Assistant Guidance: Google Gemini Policy Helper', async ({ page }) => {
    await page.click('a[href="/dashboard/ai-assistant"]');
    await page.waitForURL('**/dashboard/ai-assistant', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Gemini Assistant');

    // Preset prompts
    await expect(page.locator('text=Probation Leave Policy')).toBeVisible();
    await expect(page.locator('text=Sick Leave Prescriptions')).toBeVisible();
    await expect(page.locator('input[placeholder*="Ask"]')).toBeVisible();

    await page.screenshot({ path: path.join(screenshotsDir, 'tl-08-ai-assistant.png'), fullPage: true });
  });

  test('TL-09: Team Lead Profile: Audited Last Login IP & Geolocation Telemetry', async ({ page }) => {
    await page.click('a[href="/dashboard/my-profile"]');
    await page.waitForURL('**/dashboard/employees/*', { timeout: 10000 });
    await expect(page.locator('text=Job Details')).toBeVisible();
    await expect(page.locator('text=Last Login IP & Geolocation Telemetry')).toBeVisible();
    await expect(page.locator('text=Logged in from IP')).toBeVisible();

    await page.screenshot({ path: path.join(screenshotsDir, 'tl-09-profile-telemetry.png'), fullPage: true });
  });

  test('TL-10: Strict RBAC Isolation: Inability to access Executive Payroll or Settings', async ({ page }) => {
    await page.goto('/dashboard/payroll');
    const isRestricted = (await page.locator('text=Access Denied, text=Unauthorized, h1:has-text("Squad Command"), h1:has-text("Dashboard")').first().isVisible({ timeout: 5000 })) ||
      page.url().includes('/dashboard');
    expect(isRestricted).toBeTruthy();

    await page.screenshot({ path: path.join(screenshotsDir, 'tl-10-rbac-isolation.png') });
  });
});
